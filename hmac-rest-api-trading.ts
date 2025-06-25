import { splitHmacSha256KeyIntoEncryptedShares } from '@sodot/sodot-hmac-key-sharing';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { loadVerticesFromEnv } from './utils';

async function main() {
  const binanceApiKey = process.env.BINANCE_API_KEY;
  if (!binanceApiKey) {
    throw 'BINANCE_API_KEY is not defined in the environment variables.';
  }
  const binanceApiSecret = process.env.BINANCE_API_SECRET;
  if (!binanceApiSecret) {
    throw 'BINANCE_API_SECRET is not defined in the environment variables.';
  }

  const clusterKeyName = randomUUID().toString();
  const clusterName = process.env.CLUSTER_NAME;
  if (!clusterName) {
    throw 'CLUSTER_NAME is not defined in the environment variables.';
  }

  await importHmacSecret(clusterKeyName, binanceApiSecret, clusterName);
  console.log('HMAC secret imported successfully.');

  // Attach the policy to the key
  await attachPolicy(clusterKeyName, CONFIGURED_POLICY_NAME);
  console.log('Policy attached successfully.');

  // Now let's send a trade request to Binance
  await buySomeBtc(binanceApiKey, clusterKeyName);
  console.log('Trade request sent successfully.');
}

async function getVertexPublicKey(vertex_url: string) {
  const response = await fetch(`${vertex_url}/cluster/persistent-keygen-id`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch public key from vertex ${vertex_url}: ${response.statusText}\n${await response.text()}`
    );
  }
  const data = await response.json();
  if (!data.keygen_id) {
    throw new Error(`No keygen_id found in response from vertex ${vertex_url}`);
  }
  return data.keygen_id;
}

async function importHmacSecret(
  keyName: string,
  binanceApiSecret: string,
  clusterName: string
) {
  const apiKeyBytes = Uint8Array.from(binanceApiSecret, (char) =>
    char.charCodeAt(0)
  );

  // Fetch public keys from all vertices
  // They will be used to encrypt the shares in order to securely distribute the HMAC secret
  const verticesPubkeys = await Promise.all(
    VERTICES.map((v) => getVertexPublicKey(v.url))
  );

  const shares = await splitHmacSha256KeyIntoEncryptedShares(
    apiKeyBytes,
    verticesPubkeys[0],
    verticesPubkeys[1],
    verticesPubkeys[2]
  );

  await Promise.all(
    VERTICES.map(async (vertex, index) => {
      const response = await fetch(
        `${vertex.url}/cluster/hmac-sha256/import-secret-share`,
        {
          headers: {
            'Authorization': vertex.apiKey,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            cluster_name: clusterName,
            key_share: shares[index],
            encrypted: true,
            key_name: keyName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to import secret share to vertex ${index}: ${response.statusText}\n${await response.text()}`
        );
      }

      console.log(`Secret share imported to vertex ${index}`);
    })
  );
}

async function createRoom(): Promise<string> {
  const apiKey = VERTICES[0]?.apiKey;
  if (!apiKey) {
    throw new Error('API key is not defined for the first vertex.');
  }

  const response = await fetch(`${VERTICES[0]?.url}/create-room`, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ room_size: 3 }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create room: ${response.statusText}`);
  }
  const roomData = (await response.json()) as { room_uuid: string };
  return roomData.room_uuid;
}

async function signPayload(clusterKeyName: string, payload: string) {
  const roomUuid = await createRoom();
  const hexPayload = Buffer.from(payload, 'utf-8').toString('hex');

  const body = JSON.stringify({
    message: hexPayload,
    room_uuid: roomUuid,
    key_name: clusterKeyName,
    extra_data: '',
  });

  const signatures = await Promise.all(
    VERTICES.map(async (vertex) => {
      const response = await fetch(`${vertex.url}/hmac-sha256/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${vertex.apiKey}`,
        },
        body,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to sign payload on vertex ${vertex.url}: ${response.statusText}\n${await response.text()}`
        );
      }

      return response.json() as Promise<{ signature: string }>;
    })
  );

  if (signatures.some((sig) => sig.signature !== signatures[0]?.signature)) {
    throw new Error('Signatures do not match across vertices');
  }

  return signatures[0]?.signature;
}

async function buySomeBtc(binanceApiKey: string, clusterKeyName: string) {
  const params = {
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quantity: '0.0001',
    timestamp: Date.now().toString(),
  };

  const queryString = new URLSearchParams(params).toString();
  const signature = await signPayload(clusterKeyName, queryString);

  // Send the signed payload to Binance API
  const response = await fetch(
    `https://testnet.binance.vision/api/v3/order?${queryString}&signature=${signature}`,
    {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': binanceApiKey,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Failed to place order: ${response.statusText}\n${await response.text()}`
    );
  }

  const orderData = await response.json();
  console.log('Order placed successfully:', orderData);
}

async function attachPolicy(keyName: string, policyName: string) {
  // Its important to attach the policy for all three Vertex servers
  // to utilize the full benefits of the distributed system

  await Promise.all(
    VERTICES.map(async (vertex) => {
      const response = await fetch(
        `${vertex.url}/admin/policies/attach-policy-to-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': vertex.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key_name: keyName,
            policy_name: policyName,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Failed to attach policy to key using vertex ${vertex.url}: ${response.statusText}\n${await response.text()}`
        );
      }
    })
  );

  console.log(`Policy ${policyName} attached to key ${keyName} successfully.`);
}

dotenv.config();
const VERTICES = loadVerticesFromEnv();
const CONFIGURED_POLICY_NAME = 'limit-half-btc-orders';
main();
