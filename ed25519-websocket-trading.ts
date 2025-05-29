import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import WebSocket from 'ws';
import {
  loadVerticesFromEnv,
  promptForKeyRegistrationAndEnterApiKey as askUserToRegisterThePubkey,
  pubkeyToPEM,
} from './utils';

const BINANCE_CONFIG = {
  TESTNET_WS_URL: 'wss://ws-api.testnet.binance.vision/ws-api/v3',
  TESTNET_REST_URL: 'https://testnet.binance.vision/api/v3',
  THRESHOLD: 2,
  NUM_PARTIES: 3,
} as const;

async function main() {
  const clusterKeyName = randomUUID().toString();
  const clusterName = process.env.CLUSTER_NAME;
  if (!clusterName) {
    throw 'CLUSTER_NAME is not defined in the environment variables.';
  }
  // Generate the Ed25519 key and get the public key
  const pubkey = await generateDistributedKey(clusterKeyName);

  // Wait for user to register the public key with Binance and enter the received API key
  const apiKey = await askUserToRegisterThePubkey(pubkey);

  await executeStrategyWithWebSocket(apiKey, clusterKeyName);
}

async function executeStrategyWithWebSocket(
  binanceApiKey: string,
  clusterKeyName: string
) {
  // To execute a trading strategy, we need to perform the following steps:
  // 1. Establish a WebSocket connection to the Binance API
  // 2. Authenticate the session using a signed logon request with the Ed25519 key
  // 3. Execute the strategy by placing a market orders without signing them

  const ws = new WebSocket(BINANCE_CONFIG.TESTNET_WS_URL);

  ws.onopen = async () => {
    console.log(
      'Connected to Binance WebSocket API. Next is authentication...'
    );
    await authenticateSession(ws, binanceApiKey, clusterKeyName);

    // Sleep for 3 seconds to ensure the session is authenticated
    // In a real application, just subscribe to the response of the logon request
    await setTimeout(() => {}, 3000);
    console.log(
      'Session authenticated. Now we can execute the trading strategy...'
    );

    await executeTradingStrategy(ws);
  };

  ws.on('message', (data: WebSocket.Data) => {
    console.log('WS Received:', data.toString());
  });

  ws.onerror = (error) => {
    console.error('Binance WebSocket API error:', error);
  };
}

async function authenticateSession(
  ws: WebSocket,
  binanceApiKey: string,
  clusterKeyName: string
) {
  const timestamp = Date.now();
  const payload = `apiKey=${binanceApiKey}&timestamp=${timestamp}`;
  const signature = await signWithEd25519Key(clusterKeyName, payload);
  const requestId = randomUUID();

  console.log(
    `Authenticating session with request ID: ${requestId}, timestamp: ${timestamp}, signature: ${signature}`
  );

  await ws.send(
    JSON.stringify({
      id: requestId,
      method: 'session.logon',
      params: {
        apiKey: binanceApiKey,
        timestamp: timestamp,
        signature: Buffer.from(signature, 'hex').toString('base64'),
      },
    })
  );
}

async function executeTradingStrategy(ws: WebSocket) {
  // For the sake of this example, we will just place 3 market orders
  // In a real application, you would implement your trading strategy here
  // NOTE: The orders do not need to be signed, meaning that no added latency is introduced.
  await Promise.all(
    [1, 2, 3].map(async () => {
      const requestId = randomUUID();
      await ws.send(
        JSON.stringify({
          id: requestId,
          method: 'order.place',
          params: {
            symbol: 'BTCUSDT',
            side: 'BUY',
            type: 'MARKET',
            quantity: 0.001, // Example quantity
            timestamp: Date.now(),
          },
        })
      );
      console.log(`Placed market order with request ID: ${requestId}`);
    })
  );
}

async function generateDistributedKey(keyName: string): Promise<string> {
  // We need to create a room for the distributed key generation
  const roomUuid = await createRoom();

  // Perform key generation on all vertices
  // This will create a distributed Ed25519 key across the cluster

  const keygenReqBody = {
    room_uuid: roomUuid,
    key_name: keyName,
    num_parties: BINANCE_CONFIG.NUM_PARTIES,
    threshold: BINANCE_CONFIG.THRESHOLD,
    cluster_name: process.env.CLUSTER_NAME,
  };
  await Promise.all(
    VERTICES.map(async (vertex) => {
      await sendVertexRequest(
        `${vertex.url}/cluster/ed25519/keygen`,
        vertex.apiKey,
        keygenReqBody
      );
    })
  );

  // Get the public key from the first vertex
  // This is the public key that will be registered with Binance
  const derivePubkeyResponse = await sendVertexRequest(
    `${VERTICES[0].url}/ed25519/derive-pubkey`,
    VERTICES[0].apiKey,
    {
      key_name: keyName,
      derivation_path: [], // We don't need to derive the keys
    }
  );

  if (!derivePubkeyResponse || !derivePubkeyResponse.pubkey) {
    throw new Error(
      `Failed to get the public key of "${keyName}": ${JSON.stringify(derivePubkeyResponse)}`
    );
  }
  // Convert the public key to PEM format for binance key registration
  return await pubkeyToPEM(derivePubkeyResponse.pubkey);
}

// This function creates a room for a single MPC operation
async function createRoom(): Promise<string> {
  const apiKey = VERTICES[0]?.apiKey;
  if (!apiKey) {
    throw new Error('API key is not defined for the first vertex.');
  }

  const response = await sendVertexRequest(
    `${VERTICES[0]?.url}/create-room`,
    apiKey,
    {
      room_size: BINANCE_CONFIG.NUM_PARTIES,
    }
  );
  if (!response || !response.room_uuid) {
    throw new Error(`Failed to create room: ${JSON.stringify(response)}`);
  }
  return response.room_uuid;
}

async function signWithEd25519Key(
  keyName: string,
  message: string
): Promise<string> {
  const roomUuid = await createRoom();

  const signRequestBody = {
    room_uuid: roomUuid,
    key_name: keyName,
    msg: Buffer.from(message, 'utf-8').toString('hex'),
  };

  const signatures = await Promise.all(
    VERTICES.map(async (vertex) => {
      const response = await sendVertexRequest(
        `${vertex.url}/ed25519/sign`,
        vertex.apiKey,
        signRequestBody
      );
      if (!response || !response.signature) {
        throw new Error(
          `Failed to sign message with Ed25519 key "${keyName}" on vertex ${vertex.url}: No signature in response`
        );
      }
      return response.signature;
    })
  );

  // Check that all signatures are the same
  if (signatures.some((sig) => sig !== signatures[0])) {
    throw new Error('Signatures do not match across vertices');
  }

  return signatures[0];
}

async function sendVertexRequest(url: string, apiKey: string, body: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Request to ${url} failed: ${response.statusText}\n${await response.text()}`
    );
  }
  return response.json();
}

dotenv.config();
const VERTICES = loadVerticesFromEnv();
main();
