// import { FhevmType } from "@fhevm/hardhat-plugin"; // Unused import
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Tutorial: Red Packet Tasks
 * ==========================
 *
 * 1. Deploy contracts:
 *    npx hardhat deploy --network localhost
 *
 * 2. Mint test tokens (First time setup):
 *    npx hardhat task:rp:mint-tokens --amount 1000000 --network localhost
 *
 * 3. Approve contract as operator (Required before creating red packets):
 *    npx hardhat task:rp:approve-operator --network localhost
 *
 * 4. Create a normal red packet:
 *    npx hardhat task:rp:create-redpacket \
 *      --type 0 \
 *      --amount 1000 \
 *      --count 10 \
 *      --expire 24 \
 *      --message "Happy New Year!" \
 *      --network localhost
 *
 * 5. Create a random red packet:
 *    npx hardhat task:rp:create-redpacket \
 *      --type 1 \
 *      --amount 2000 \
 *      --count 5 \
 *      --expire 48 \
 *      --message "Lucky Draw!" \
 *      --network localhost
 *
 * 6. View red packet info:
 *    npx hardhat task:rp:view-redpacket --id 0 --network localhost
 *
 * 7. Claim red packet:
 *    npx hardhat task:rp:claim-redpacket --id 0 --network localhost
 *
 * 8. View my claim record:
 *    npx hardhat task:rp:view-claim --id 0 --network localhost
 *
 * 9. Check token balance:
 *    npx hardhat task:rp:view-balance --network localhost
 *
 * 10. List all red packets:
 *    npx hardhat task:rp:list-redpackets --network localhost
 */

// Helper function to format timestamps
function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Task: Mint test tokens for red packet testing
 */
task("task:rp:mint-tokens", "Mint test tokens for red packet testing")
  .addParam("amount", "Amount of tokens to mint")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const [deployer] = await ethers.getSigners();
    console.log("Minting tokens for:", deployer.address);

    // Get token contract from deployments
    const tokenDeployment = await deployments.get("ConfidentialToken");
    console.log(`Token Contract: ${tokenDeployment.address}`);

    const token = await ethers.getContractAt("ConfidentialToken", tokenDeployment.address);
    const amount = parseInt(taskArgs.amount);

    // Mint tokens
    const tx = await token.mint(deployer.address, amount);
    await tx.wait();

    console.log(`✅ Minted ${amount} tokens to ${deployer.address}`);
  });

/**
 * Task: Approve red packet contract as operator
 */
task("task:rp:approve-operator", "Approve red packet contract as operator")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const [deployer] = await ethers.getSigners();
    console.log("Approving operator for:", deployer.address);

    // Get contracts from deployments
    const tokenDeployment = await deployments.get("ConfidentialToken");
    const redPacketDeployment = await deployments.get("RedPacket");
    
    console.log(`Token Contract: ${tokenDeployment.address}`);
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const token = await ethers.getContractAt("ConfidentialToken", tokenDeployment.address);
    
    // Set operator for far future (following test pattern)
    const block = await ethers.provider.getBlock("latest");
    const futureTimestamp = block!.timestamp + 100000000; // Far future
    const tx = await token.setOperator(redPacketDeployment.address, futureTimestamp);
    await tx.wait();

    console.log(`✅ Approved ${redPacketDeployment.address} as operator until ${formatTime(futureTimestamp)}`);
  });

/**
 * Task: Create a red packet
 */
task("task:rp:create-redpacket", "Create a new red packet")
  .addParam("type", "Red packet type (0=Normal, 1=Random)")
  .addParam("amount", "Total amount for the red packet")
  .addParam("count", "Number of red packets")
  .addParam("expire", "Expiration time in hours")
  .addParam("message", "Blessing message")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm }) => {
    const [deployer] = await ethers.getSigners();
    console.log("Creating red packet for:", deployer.address);

    // Initialize FHEVM CLI API
    await fhevm.initializeCLIApi();

    // Get contracts from deployments
    const tokenDeployment = await deployments.get("ConfidentialToken");
    const redPacketDeployment = await deployments.get("RedPacket");
    
    console.log(`Token Contract: ${tokenDeployment.address}`);
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const redPacket = await ethers.getContractAt("RedPacket", redPacketDeployment.address);
    
    const packetType = parseInt(taskArgs.type);
    const amount = parseInt(taskArgs.amount);
    const count = parseInt(taskArgs.count);
    const expireHours = parseInt(taskArgs.expire);
    const message = taskArgs.message;
    
    // Calculate expiration time using blockchain timestamp
    const block = await ethers.provider.getBlock("latest");
    console.log(`Block timestamp: ${block!.timestamp}`);
    const expireTime = block!.timestamp + (expireHours * 3600);

    console.log(`Creating red packet:`);
    console.log(`  Type: ${packetType === 0 ? 'Normal' : 'Random'}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  Count: ${count}`);
    console.log(`  Expires: ${formatTime(expireTime)}`);
    console.log(`  Message: ${message}`);

    // Create encrypted input
    const encryptedInput = await fhevm.createEncryptedInput(
      tokenDeployment.address,
      redPacketDeployment.address
    ).add64(amount).encrypt();

    // Create red packet
    const tx = await redPacket.createRedPacket(
      packetType,
      encryptedInput.handles[0],
      encryptedInput.inputProof,
      count,
      expireTime,
      message
    );
    
    const receipt = await tx.wait();
    console.log(`✅ Red packet created! Transaction: ${tx.hash}`);

    // Get red packet ID from events
    const event = receipt?.logs.find((log: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        const parsed = redPacket.interface.parseLog(log);
        return parsed?.name === "RedPacketCreated";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = redPacket.interface.parseLog(event);
      const redPacketId = parsed?.args[0];
      console.log(`📦 Red Packet ID: ${redPacketId}`);
    }
  });

/**
 * Task: View red packet information
 */
task("task:rp:view-redpacket", "View red packet information")
  .addParam("id", "Red packet ID")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const redPacketDeployment = await deployments.get("RedPacket");
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const redPacket = await ethers.getContractAt("RedPacket", redPacketDeployment.address);
    const redPacketId = parseInt(taskArgs.id);

    try {
      const packetInfo = await redPacket.getRedPacket(redPacketId);
      
      if (!packetInfo.exists) {
        console.log("❌ Red packet not found");
        return;
      }

      console.log(`\n📦 Red Packet #${redPacketId}`);
      console.log(`  Creator: ${packetInfo.creator}`);
      console.log(`  Type: ${Number(packetInfo.packetType) === 0 ? 'Normal' : 'Random'}`);
      console.log(`  Status: ${Number(packetInfo.status) === 0 ? 'Active' : Number(packetInfo.status) === 1 ? 'Expired' : 'Empty'}`);
      console.log(`  Total Count: ${packetInfo.totalCount}`);
      console.log(`  Remaining: ${packetInfo.remainingCount}`);
      console.log(`  Created: ${formatTime(Number(packetInfo.createdAt))}`);
      console.log(`  Expires: ${formatTime(Number(packetInfo.expireTime))}`);
      console.log(`  Message: ${packetInfo.message}`);
      
      // Check if active
      const isActive = await redPacket.isRedPacketActive(redPacketId);
      console.log(`  Currently Active: ${isActive ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.log("❌ Error viewing red packet:", error);
    }
  });

/**
 * Task: Claim a red packet
 */
task("task:rp:claim-redpacket", "Claim a red packet")
  .addParam("id", "Red packet ID")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const [deployer] = await ethers.getSigners();
    console.log("Claiming red packet for:", deployer.address);

    const redPacketDeployment = await deployments.get("RedPacket");
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const redPacket = await ethers.getContractAt("RedPacket", redPacketDeployment.address);
    const redPacketId = parseInt(taskArgs.id);

    try {
      // Check if already claimed
      const claimRecord = await redPacket.getClaimRecord(redPacketId, deployer.address);
      if (claimRecord.exists) {
        console.log("❌ You have already claimed this red packet");
        return;
      }

      // Check if active
      const isActive = await redPacket.isRedPacketActive(redPacketId);
      if (!isActive) {
        console.log("❌ Red packet is not active");
        return;
      }

      // Claim red packet
      const tx = await redPacket.claimRedPacket(redPacketId);
      await tx.wait();

      console.log(`✅ Red packet claimed! Transaction: ${tx.hash}`);
      
      // View updated info
      const packetInfo = await redPacket.getRedPacket(redPacketId);
      console.log(`📦 Remaining packets: ${packetInfo.remainingCount}/${packetInfo.totalCount}`);
      
    } catch (error) {
      console.log("❌ Error claiming red packet:", error);
    }
  });

/**
 * Task: View claim record
 */
task("task:rp:view-claim", "View claim record for a red packet")
  .addParam("id", "Red packet ID")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const [deployer] = await ethers.getSigners();
    const redPacketDeployment = await deployments.get("RedPacket");
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const redPacket = await ethers.getContractAt("RedPacket", redPacketDeployment.address);
    const redPacketId = parseInt(taskArgs.id);

    try {
      const claimRecord = await redPacket.getClaimRecord(redPacketId, deployer.address);
      
      if (!claimRecord.exists) {
        console.log("❌ No claim record found for this red packet");
        return;
      }

      console.log(`\n🎁 Claim Record for Red Packet #${redPacketId}`);
      console.log(`  User: ${claimRecord.user}`);
      console.log(`  Claimed at: ${formatTime(Number(claimRecord.timestamp))}`);
      console.log(`  Amount: [Encrypted]`);
      
    } catch (error) {
      console.log("❌ Error viewing claim record:", error);
    }
  });

/**
 * Task: View token balance
 */
task("task:rp:view-balance", "View confidential token balance")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const [deployer] = await ethers.getSigners();
    console.log("Checking balance for:", deployer.address);

    const tokenDeployment = await deployments.get("ConfidentialToken");
    console.log(`Token Contract: ${tokenDeployment.address}`);

    const token = await ethers.getContractAt("ConfidentialToken", tokenDeployment.address);
    
    try {
      const balance = await token.confidentialBalanceOf(deployer.address);
      console.log(`💰 Confidential Balance: [Encrypted]`);
      console.log(`   Handle: ${balance}`);
      
    } catch (error) {
      console.log("❌ Error viewing balance:", error);
    }
  });

/**
 * Task: List all red packets
 */
task("task:rp:list-redpackets", "List all red packets")
  .setAction(async (taskArgs: TaskArguments, { ethers, deployments, fhevm: _fhevm }) => {
    const redPacketDeployment = await deployments.get("RedPacket");
    console.log(`RedPacket Contract: ${redPacketDeployment.address}`);

    const redPacket = await ethers.getContractAt("RedPacket", redPacketDeployment.address);

    try {
      const count = await redPacket.redPacketCount();
      const totalCount = Number(count);
      
      console.log(`\n📦 Red Packets (Total: ${totalCount})`);
      console.log("=" .repeat(50));
      
      if (totalCount === 0) {
        console.log("No red packets found");
        return;
      }

      for (let i = 0; i < totalCount; i++) {
        try {
          const packetInfo = await redPacket.getRedPacket(i);
          
          if (packetInfo.exists) {
            const isActive = await redPacket.isRedPacketActive(i);
            const status = isActive ? '🟢 Active' : 
                          Number(packetInfo.status) === 1 ? '🔴 Expired' : '🔵 Empty';
            
            console.log(`\n#${i} ${status}`);
            console.log(`  Creator: ${packetInfo.creator.slice(0, 6)}...${packetInfo.creator.slice(-4)}`);
            console.log(`  Type: ${Number(packetInfo.packetType) === 0 ? 'Normal' : 'Random'}`);
            console.log(`  Count: ${packetInfo.remainingCount}/${packetInfo.totalCount}`);
            console.log(`  Message: ${packetInfo.message || 'No message'}`);
            console.log(`  Expires: ${formatTime(Number(packetInfo.expireTime))}`);
          }
        } catch {
          console.log(`#${i} ❌ Error loading`);
        }
      }
      
    } catch (error) {
      console.log("❌ Error listing red packets:", error);
    }
  });
