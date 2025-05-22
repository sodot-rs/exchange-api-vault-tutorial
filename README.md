# Sodot Exchange API Vault Onboarding Tutorial

This is a minimal JS code example that demonstrates the basic usage flows of the Sodot Exchange API Vault.
For the full documentation, please refer to the [Sodot Exchange API Vault documentation](https://docs.sodot.dev/exchange-api-vault/intro).

The example shows how to:

1. Securely **import** keys into the distributed key management system.
2. **Trade** with the imported key without the trading machine ever being exposed to the key.
3. **Enforce a simple policy** for that key.

## Running the example

### Pre-requisites

- Make sure you have NodeJS and NPM installed.

### Set up environment variables

Create a `.env` file in the root of the project and add the following variables:

```bash
# The API keys for the Sodot Exchange API Vault - 3 Vertex nodes
# You can use the demo nodes or set up your own
VERTEX_0_URL=<YOUR_VERTEX_0_URL | https://demo-exchange-vault-0.sodot.dev>
VERTEX_0_API_KEY=<API_KEY_0>
VERTEX_1_URL=<YOUR_VERTEX_1_URL | https://demo-exchange-vault-1.sodot.dev>
VERTEX_1_API_KEY=<API_KEY_1>
VERTEX_2_URL=<YOUR_VERTEX_2_URL | https://demo-exchange-vault-2.sodot.dev>
VERTEX_2_API_KEY=<API_KEY_2>

# You will need to use a Vertex cluster for this example
# You can use the demo cluster or set up your own
# Docs for setting up your own cluster are here: https://docs.sodot.dev/vertex/keygen/cluster_keygen#setting-up-a-cluster
CLUSTER_NAME=<YOUR_VERTEX_CLUSTER_NAME | aae33597-8c2c-4fa9-89ca-f73780596f27>

# The API keys for the exchange, in this case, we are using Binance
BINANCE_API_KEY=<YOUR_BINANCE_API_KEY>
BINANCE_API_SECRET=<YOUR_BINANCE_API_SECRET>
```

### Run the example

Install dependencies with:

```bash
npm i
```

Run with:

```bash
npm start
```
