# Red Packet 🧧

A privacy-preserving red packet (hongbao) distribution system built with Fully Homomorphic Encryption (FHE) using Zama's FHEVM protocol. All token amounts remain encrypted on-chain, ensuring complete privacy for both senders and recipients.

## 🌟 Features

- **🔐 Fully Encrypted Amounts**: All token amounts are encrypted using FHE, ensuring privacy throughout the entire lifecycle
- **🎁 Dual Distribution Modes**: 
  - Normal Mode: Equal distribution among all recipients
  - Random Mode: Random amount distribution (coming soon)
- **🪙 ERC7984 Standard**: Implements the confidential token standard with encrypted balances
- **⏰ Time-Limited Red Packets**: Automatic expiration with refund mechanism
- **🔒 Privacy by Design**: No one can see the amount until decryption is explicitly authorized
- **🧪 Comprehensive Testing**: Full test suite with mocked FHE operations

## 📁 Project Structure

```
zama-hongbao-contracts/
├── contracts/
│   ├── RedPacket.sol                    # Main red packet contract
│   ├── ConfidentialToken.sol            # ERC7984 confidential token
│   └── tokens/
│       ├── ERC7984.sol                  # Base ERC7984 implementation
│       ├── IERC7984.sol                 # ERC7984 interface
│       ├── IERC7984Receiver.sol         # Receiver callback interface
│       ├── ERC7984Utils.sol             # Utility functions
│       └── FHESafeMath.sol              # Safe math for encrypted values
├── deploy/                              # Deployment scripts
│   ├── 01_deploy_confidential_token.ts
│   └── 02_deploy_redpacket.ts
├── tasks/                               # Hardhat custom tasks
│   ├── accounts.ts
│   └── RedPacket.ts                     # RedPacket interaction tasks
├── test/
│   └── RedPacket.ts                     # Comprehensive test suite
└── hardhat.config.ts                    # Hardhat configuration
```

## 🏗️ Smart Contract Architecture

### RedPacket Contract

The main contract managing encrypted red packet creation and distribution:

**Key Features:**
- Create red packets with encrypted amounts
- Support for multiple distribution types (normal/random)
- Time-based expiration mechanism
- Prevent double claiming
- Encrypted claim records

**Core Functions:**
- `createRedPacket()`: Create a new red packet with encrypted amount
- `claimRedPacket()`: Claim tokens from an active red packet
- `getRedPacket()`: View red packet details
- `isRedPacketActive()`: Check if red packet is still claimable

### ConfidentialToken Contract

ERC7984-compliant confidential token with encrypted balances:

**Key Features:**
- Fully encrypted token balances and transfers
- Mint/burn with both clear and encrypted amounts
- Operator mechanism for delegated transfers
- Owner can decrypt total supply for auditing

**Core Functions:**
- `mint()` / `confidentialMint()`: Mint tokens with visible or encrypted amounts
- `burn()` / `confidentialBurn()`: Burn tokens with visible or encrypted amounts
- `confidentialTransfer()`: Transfer encrypted amounts
- `confidentialTransferFrom()`: Transfer on behalf with operator permission
- `setOperator()`: Approve an operator for confidential transfers

## 🚀 Quick Start

### Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Version 7.0.0 or higher

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   ```bash
# Set your mnemonic for deployment
   npx hardhat vars set MNEMONIC

   # Set your Infura API key for network access
   npx hardhat vars set INFURA_API_KEY

   # Optional: Set Etherscan API key for contract verification
   npx hardhat vars set ETHERSCAN_API_KEY
   ```

3. **Compile contracts**

   ```bash
   npm run compile
```

4. **Run tests**

```bash
   npm run test
   ```

## 🚢 Deployment

### Deploy to Local Network

   ```bash
   # Start a local FHEVM-ready node
   npx hardhat node

# In another terminal, deploy contracts
   npx hardhat deploy --network localhost
   ```

### Deploy to Sepolia Testnet

   ```bash
# Deploy all contracts
   npx hardhat deploy --network sepolia

# Deploy only RedPacket contract
npx hardhat deploy --network sepolia --tags RedPacket

# Verify contracts on Etherscan
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

### Test on Sepolia

   ```bash
   npx hardhat test --network sepolia
   ```

## 📜 Available Scripts

| Script                     | Description                            |
|---------------------------|----------------------------------------|
| `npm run compile`         | Compile all contracts                  |
| `npm run test`            | Run all tests on local network         |
| `npm run test:sepolia`    | Run tests on Sepolia testnet           |
| `npm run coverage`        | Generate test coverage report          |
| `npm run lint`            | Run linting checks (Solidity + TS)     |
| `npm run lint:sol`        | Run Solidity linting only              |
| `npm run lint:ts`         | Run TypeScript linting only            |
| `npm run prettier:check`  | Check code formatting                  |
| `npm run prettier:write`  | Auto-fix code formatting               |
| `npm run clean`           | Clean build artifacts                  |
| `npm run typechain`       | Generate TypeScript types              |
| `npm run chain`           | Start local Hardhat node               |
| `npm run deploy:localhost`| Deploy to local network                |
| `npm run deploy:sepolia`  | Deploy to Sepolia testnet              |

## 💡 Usage Examples

### Creating a Red Packet

```typescript
import { ethers, fhevm } from "hardhat";

// 1. Get contract instances
const token = await ethers.getContractAt("ConfidentialToken", TOKEN_ADDRESS);
const redPacket = await ethers.getContractAt("RedPacket", REDPACKET_ADDRESS);

// 2. Approve RedPacket contract as operator
const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours
await token.setOperator(REDPACKET_ADDRESS, futureTimestamp);

// 3. Create encrypted input for amount
const amount = 1000; // Total amount to distribute
const encryptedInput = await fhevm.createEncryptedInput(
  REDPACKET_ADDRESS,
  userAddress
);
encryptedInput.add64(amount);
const encrypted = await encryptedInput.encrypt();

// 4. Create red packet
const expireTime = Math.floor(Date.now() / 1000) + 3600; // Expires in 1 hour
const tx = await redPacket.createRedPacket(
  0, // RedPacketType.NORMAL
  encrypted.handles[0],
  encrypted.inputProof,
  10, // Number of recipients
  expireTime,
  "Happy New Year!"
);

const receipt = await tx.wait();
console.log("Red Packet created:", receipt.hash);
```

### Claiming a Red Packet

```typescript
// Simply call claimRedPacket with the red packet ID
const redPacketId = 0;
const tx = await redPacket.claimRedPacket(redPacketId);
await tx.wait();

console.log("Red packet claimed successfully!");

// Check your encrypted balance
const encryptedBalance = await token.confidentialBalanceOf(userAddress);
```

### Checking Red Packet Status

```typescript
// Get red packet details
const packet = await redPacket.getRedPacket(redPacketId);
console.log("Creator:", packet.creator);
console.log("Type:", packet.packetType); // 0=NORMAL, 1=RANDOM
console.log("Status:", packet.status); // 0=ACTIVE, 1=EXPIRED, 2=EMPTY
console.log("Remaining count:", packet.remainingCount);
console.log("Message:", packet.message);

// Check if still active
const isActive = await redPacket.isRedPacketActive(redPacketId);
console.log("Is active:", isActive);

// Get all claimers
const claimers = await redPacket.getRedPacketClaimers(redPacketId);
console.log("Claimers:", claimers);
```

## 🧪 Testing

The project includes comprehensive tests covering:

- ✅ Contract deployment and initialization
- ✅ Red packet creation with various parameters
- ✅ Normal and random distribution modes
- ✅ Claiming mechanics and double-claim prevention
- ✅ Time-based expiration
- ✅ Edge cases and error handling
- ✅ Integration with ERC7984 token

Run tests:
```bash
# Run all tests with coverage
npm run coverage

# Run specific test file
npx hardhat test test/RedPacket.ts

# Run tests with gas reporting
REPORT_GAS=true npm run test
```

## 🛠️ Technology Stack

- **Solidity**: ^0.8.24
- **Hardhat**: ^2.26.0 - Development environment
- **FHEVM**: ^0.8.0 - Fully Homomorphic Encryption VM by Zama
- **OpenZeppelin**: ^5.4.0 - Secure smart contract library
- **TypeScript**: ^5.8.3 - Type-safe development
- **Ethers.js**: ^6.15.0 - Ethereum interaction library

## 🔒 Security Considerations

- **Encryption**: All amounts are encrypted using TFHE (Threshold FHE)
- **Access Control**: Uses Ownable2Step for secure ownership transfer
- **Operator Pattern**: Follows ERC7984 standard for delegated transfers
- **Time Locks**: Red packets automatically expire after specified time
- **Double Claim Prevention**: Each address can only claim once per red packet
- **Input Validation**: Comprehensive parameter validation on all functions

## 🗺️ Roadmap

- [x] Basic red packet creation and claiming
- [x] ERC7984 confidential token implementation
- [x] Time-based expiration mechanism
- [x] Comprehensive test suite
- [ ] Random distribution algorithm implementation
- [ ] Refund mechanism for expired/unclaimed red packets
- [ ] Multi-token support
- [ ] Advanced distribution strategies

## 📚 Documentation

- [FHEVM Documentation](https://docs.zama.ai/fhevm)
- [ERC7984 Standard](https://eips.ethereum.org/EIPS/eip-7984)
- [FHEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)
- [Zama FHE Tutorial](https://docs.zama.ai/protocol/solidity-guides/getting-started/quick-start-tutorial)

## 📄 License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Zama**: For providing the FHEVM protocol and excellent documentation
- **OpenZeppelin**: For secure smart contract patterns
- **ERC7984**: For the confidential token standard

## 🆘 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/any0Ne1010/zama-hongbao-contracts/issues)
- **Zama Documentation**: [FHEVM Docs](https://docs.zama.ai)
- **Zama Community**: [Zama Discord](https://discord.gg/zama)

---
