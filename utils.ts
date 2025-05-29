import readline from 'readline';
import * as jose from 'jose';

// Prompt for registration confirmation
// Get back the api key from the user
export async function promptForKeyRegistrationAndEnterApiKey(
  pubkey: string
): Promise<string> {
  const registrationPrompt = `Have you registered the Ed25519 public key with Binance and are ready to provide the associated API Key?`;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    function askForRegistrationConfirmation() {
      rl.question(
        `${registrationPrompt} (Type 'y' or 'yes' to confirm and proceed to enter API key): `,
        (answer) => {
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            askForApiKey();
          } else {
            console.log(
              "Registration not confirmed. Please type 'y' or 'yes' to proceed, or Ctrl+C to exit."
            );
            askForRegistrationConfirmation();
          }
        }
      );
    }

    function askForApiKey() {
      rl.question(
        'Please enter the Binance API Key associated with the registered public key: ',
        (apiKeyInput) => {
          const trimmedApiKey = apiKeyInput.trim();
          if (trimmedApiKey) {
            rl.close();
            resolve(trimmedApiKey);
          } else {
            console.log('Binance API Key cannot be empty. Please try again.');
            askForApiKey();
          }
        }
      );
    }
    askForRegistrationConfirmation();
  });
}

export async function pubkeyToPEM(pubkeyHex: string): Promise<string> {
  const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: pubkeyBuffer.toString('base64url'),
  };
  const importedKey = await jose.importJWK(jwk, 'Ed25519');
  if (importedKey instanceof Uint8Array) {
    throw new Error(
      'jose.importJWK returned a Uint8Array for the public key, which is not directly usable for SPKI export. Expected a CryptoKey.'
    );
  }
  const spkiPem = await jose.exportSPKI(importedKey);
  console.log(`Public key PEM:\n${spkiPem}`);
  return spkiPem;
}

export function loadVerticesFromEnv() {
  let vertices: any = [];
  for (let i = 0; i < 3; i++) {
    const vertexUrl = process.env[`VERTEX_${i}_URL`];
    if (!vertexUrl) {
      throw `VERTEX_${i}_URL is not defined in the environment variables.`;
    }

    const VertexApiKey = process.env[`VERTEX_${i}_API_KEY`];
    if (!VertexApiKey) {
      throw `VERTEX_${i}_API_KEY is not defined in the environment variables.`;
    }

    vertices.push({
      url: vertexUrl,
      apiKey: VertexApiKey,
    });
  }

  return vertices;
}
