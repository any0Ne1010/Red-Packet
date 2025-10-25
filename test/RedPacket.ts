import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { RedPacket, RedPacket__factory } from "../types";
import { expect } from "chai";

// Helper function to increase time
async function increaseTimeTo(timestamp: bigint) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await network.provider.send("evm_mine");
}

// Helper function to get current block time and calculate expire time
async function getExpireTime(hoursFromNow: number): Promise<number> {
  const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
  return currentTime + hoursFromNow * 3600;
}

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  charlie: HardhatEthersSigner;
};

async function deployFixture() {
  // Deploy ConfidentialToken first
  const tokenFactory = await ethers.getContractFactory("ConfidentialToken");
  const token = await tokenFactory.deploy(
    (await ethers.getSigners())[0].address, // owner
    0, // No initial supply - will mint later
    "Test Token",
    "TEST",
    ""
  );
  const tokenAddress = await token.getAddress();

  // Deploy RedPacket with token address
  const factory = (await ethers.getContractFactory("RedPacket")) as RedPacket__factory;
  const redPacket = (await factory.deploy(tokenAddress)) as RedPacket;
  const redPacketAddress = await redPacket.getAddress();

  return { redPacket, redPacketAddress, token, tokenAddress };
}

describe("RedPacket", function () {
  let signers: Signers;
  let redPacket: RedPacket;
  let redPacketAddress: string;
  let token: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  let tokenAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2], charlie: ethSigners[3] };
  });

  beforeEach(async function () {
    const fixture = await deployFixture();
    redPacket = fixture.redPacket;
    redPacketAddress = fixture.redPacketAddress;
    token = fixture.token;
    tokenAddress = fixture.tokenAddress;

    // Mint tokens to all signers
    const mintAmount = 1000000;
    await token.mint(signers.deployer.address, mintAmount);
    await token.mint(signers.alice.address, mintAmount);
    await token.mint(signers.bob.address, mintAmount);
    await token.mint(signers.charlie.address, mintAmount);

    // Set red packet contract as operator for all signers (following privacy-pool pattern)
    const block = await ethers.provider.getBlock("latest");
    const blockTimestamp = block!.timestamp;
    const futureTimestamp = blockTimestamp + 100000000; // Far future
    
    await token.connect(signers.deployer).setOperator(redPacketAddress, futureTimestamp);
    await token.connect(signers.alice).setOperator(redPacketAddress, futureTimestamp);
    await token.connect(signers.bob).setOperator(redPacketAddress, futureTimestamp);
    await token.connect(signers.charlie).setOperator(redPacketAddress, futureTimestamp);
  });

  describe("Deployment", function () {
    it("Should deploy with correct token address", async function () {
      expect(await redPacket.TOKEN()).to.equal(tokenAddress);
    });

    it("Should start with zero red packet count", async function () {
      expect(await redPacket.redPacketCount()).to.equal(0);
    });
  });

  describe("Red Packet Creation", function () {
    it("Should create a normal red packet successfully", async function () {
      const amount = 1000;
      const count = 10;
      const expireTime = await getExpireTime(24); // 24 hours from now
      const message = "Happy New Year!";

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      const tx = await redPacket.connect(signers.alice).createRedPacket(
        0, // Normal type
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        message
      );

      await expect(tx)
        .to.emit(redPacket, "RedPacketCreated")
        .withArgs(0, signers.alice.address, 0, count, expireTime, message);

      // Check red packet count
      expect(await redPacket.redPacketCount()).to.equal(1);

      // Check red packet info
      const packetInfo = await redPacket.getRedPacket(0);
      expect(packetInfo.id).to.equal(0);
      expect(packetInfo.creator).to.equal(signers.alice.address);
      expect(packetInfo.packetType).to.equal(0); // Normal
      expect(packetInfo.status).to.equal(0); // Active
      expect(packetInfo.totalCount).to.equal(count);
      expect(packetInfo.remainingCount).to.equal(count);
      expect(packetInfo.expireTime).to.equal(expireTime);
      expect(packetInfo.message).to.equal(message);
      expect(packetInfo.exists).to.be.equal(true);
    });

    it("Should create a random red packet successfully", async function () {
      const amount = 2000;
      const count = 5;
      const expireTime = await getExpireTime(48); // 48 hours from now
      const message = "Lucky Draw!";

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      const tx = await redPacket.connect(signers.bob).createRedPacket(
        1, // Random type
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        message
      );

      await expect(tx)
        .to.emit(redPacket, "RedPacketCreated")
        .withArgs(0, signers.bob.address, 1, count, expireTime, message);

      // Check red packet info
      const packetInfo = await redPacket.getRedPacket(0);
      expect(packetInfo.packetType).to.equal(1); // Random
    });

    it("Should reject invalid parameters", async function () {
      const amount = 1000;
      const expireTime = await getExpireTime(24);

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Test zero count
      await expect(
        redPacket.connect(signers.alice).createRedPacket(
          0,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
          0, // Invalid count
          expireTime,
          "Test"
        )
      ).to.be.revertedWithCustomError(redPacket, "InvalidCount");

      // Test count > 100
      await expect(
        redPacket.connect(signers.alice).createRedPacket(
          0,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
          101, // Invalid count
          expireTime,
          "Test"
        )
      ).to.be.revertedWithCustomError(redPacket, "InvalidCount");

      // Test past expiration time
      const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
      const pastTime = currentTime - 3600; // 1 hour ago
      await expect(
        redPacket.connect(signers.alice).createRedPacket(
          0,
          encryptedInput.handles[0],
          encryptedInput.inputProof,
          10,
          pastTime, // Invalid time
          "Test"
        )
      ).to.be.revertedWithCustomError(redPacket, "InvalidExpireTime");
    });
  });

  describe("Red Packet Claiming", function () {
    let redPacketId: number;
    let expireTime: number;

    beforeEach(async function () {
      const amount = 1000;
      const count = 5;
      expireTime = await getExpireTime(24); // 24 hours

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Create a red packet
      const tx = await redPacket.connect(signers.alice).createRedPacket(
        0, // Normal type
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        "Test Red Packet"
      );

      const receipt = await tx.wait();
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
        redPacketId = Number(parsed?.args[0]);
      }
    });

    it("Should allow claiming an active red packet", async function () {
      const tx = await redPacket.connect(signers.bob).claimRedPacket(redPacketId);

      await expect(tx)
        .to.emit(redPacket, "RedPacketClaimed")
        .withArgs(redPacketId, signers.bob.address, 4); // 5 - 1 = 4 remaining

      // Check claim record
      const claimRecord = await redPacket.getClaimRecord(redPacketId, signers.bob.address);
      expect(claimRecord.exists).to.be.equal(true);
      expect(claimRecord.user).to.equal(signers.bob.address);

      // Check red packet info
      const packetInfo = await redPacket.getRedPacket(redPacketId);
      expect(packetInfo.remainingCount).to.equal(4);
    });

    it("Should prevent double claiming", async function () {
      // First claim
      await redPacket.connect(signers.bob).claimRedPacket(redPacketId);

      // Second claim should fail
      await expect(
        redPacket.connect(signers.bob).claimRedPacket(redPacketId)
      ).to.be.revertedWithCustomError(redPacket, "AlreadyClaimed");
    });

    it("Should prevent claiming expired red packet", async function () {
      // Fast forward time to after expiration
      await increaseTimeTo(BigInt(expireTime + 3600));

      await expect(
        redPacket.connect(signers.bob).claimRedPacket(redPacketId)
      ).to.be.revertedWithCustomError(redPacket, "RedPacketExpiredError");
    });

    it("Should prevent claiming empty red packet", async function () {
      // Claim all red packets (we have 5 total, so we need 5 different users)
      await redPacket.connect(signers.bob).claimRedPacket(redPacketId);
      await redPacket.connect(signers.charlie).claimRedPacket(redPacketId);
      await redPacket.connect(signers.deployer).claimRedPacket(redPacketId);
      await redPacket.connect(signers.alice).claimRedPacket(redPacketId);
      
      // Create a new signer for the 5th claim
      const [, , , , newSigner] = await ethers.getSigners();
      await token.mint(newSigner.address, 1000000);
      await token.connect(newSigner).setOperator(redPacketAddress, await ethers.provider.getBlock('latest').then(block => block!.timestamp + 100000000));
      await redPacket.connect(newSigner).claimRedPacket(redPacketId);

      // Try to claim from empty red packet
      // Note: When red packet is empty, status becomes EMPTY, so we get RedPacketExpiredError
      await expect(
        redPacket.connect(signers.bob).claimRedPacket(redPacketId)
      ).to.be.revertedWithCustomError(redPacket, "RedPacketExpiredError");
    });

    it("Should update status when red packet is empty", async function () {
      // Claim all red packets (we have 5 total, so we need 5 different users)
      await redPacket.connect(signers.bob).claimRedPacket(redPacketId);
      await redPacket.connect(signers.charlie).claimRedPacket(redPacketId);
      await redPacket.connect(signers.deployer).claimRedPacket(redPacketId);
      await redPacket.connect(signers.alice).claimRedPacket(redPacketId);
      
      // Create a new signer for the 5th claim
      const [, , , , newSigner] = await ethers.getSigners();
      await token.mint(newSigner.address, 1000000);
      await token.connect(newSigner).setOperator(redPacketAddress, await ethers.provider.getBlock('latest').then(block => block!.timestamp + 100000000));
      await redPacket.connect(newSigner).claimRedPacket(redPacketId);

      // Check status
      const packetInfo = await redPacket.getRedPacket(redPacketId);
      expect(packetInfo.status).to.equal(2); // Empty
      expect(packetInfo.remainingCount).to.equal(0);
    });
  });

  describe("Red Packet Information", function () {
    it("Should return correct red packet information", async function () {
      const amount = 1000;
      const count = 3;
      const expireTime = await getExpireTime(24);
      const message = "Test Message";

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Create red packet
      await redPacket.connect(signers.alice).createRedPacket(
        0,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        message
      );

      // Get red packet info
      const packetInfo = await redPacket.getRedPacket(0);
      expect(packetInfo.id).to.equal(0);
      expect(packetInfo.creator).to.equal(signers.alice.address);
      expect(packetInfo.packetType).to.equal(0);
      expect(packetInfo.status).to.equal(0);
      expect(packetInfo.totalCount).to.equal(count);
      expect(packetInfo.remainingCount).to.equal(count);
      expect(packetInfo.expireTime).to.equal(expireTime);
      expect(packetInfo.message).to.equal(message);
      expect(packetInfo.exists).to.be.equal(true);
    });

    it("Should return empty claim record for non-claimer", async function () {
      const amount = 1000;
      const count = 3;
      const expireTime = await getExpireTime(24);

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Create red packet
      await redPacket.connect(signers.alice).createRedPacket(
        0,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        "Test"
      );

      // Check claim record for non-claimer
      const claimRecord = await redPacket.getClaimRecord(0, signers.bob.address);
      expect(claimRecord.exists).to.be.equal(false);
    });

    it("Should return correct claim record after claiming", async function () {
      const amount = 1000;
      const count = 3;
      const expireTime = await getExpireTime(24);

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Create red packet
      await redPacket.connect(signers.alice).createRedPacket(
        0,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        "Test"
      );

      // Claim red packet
      await redPacket.connect(signers.bob).claimRedPacket(0);

      // Check claim record
      const claimRecord = await redPacket.getClaimRecord(0, signers.bob.address);
      expect(claimRecord.exists).to.be.equal(true);
      expect(claimRecord.user).to.equal(signers.bob.address);
    });

    it("Should correctly identify active red packets", async function () {
      const amount = 1000;
      const count = 3;
      const expireTime = await getExpireTime(24);

      // Create encrypted input
      const encryptedInput = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount).encrypt();

      // Create red packet
      await redPacket.connect(signers.alice).createRedPacket(
        0,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        count,
        expireTime,
        "Test"
      );

      // Check if active
      expect(await redPacket.isRedPacketActive(0)).to.be.equal(true);

      // Fast forward to expiration
      await increaseTimeTo(BigInt(expireTime + 3600));

      // Check if still active
      expect(await redPacket.isRedPacketActive(0)).to.be.equal(false);
    });
  });

  describe("Multiple Red Packets", function () {
    it("Should handle multiple red packets correctly", async function () {
      const amount1 = 1000;
      const amount2 = 2000;
      const count = 2;
      const expireTime = await getExpireTime(24);

      // Create first red packet
      const encryptedInput1 = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount1).encrypt();

      await redPacket.connect(signers.alice).createRedPacket(
        0,
        encryptedInput1.handles[0],
        encryptedInput1.inputProof,
        count,
        expireTime,
        "First Red Packet"
      );

      // Create second red packet
      const encryptedInput2 = await fhevm.createEncryptedInput(
        tokenAddress,
        redPacketAddress
      ).add64(amount2).encrypt();

      await redPacket.connect(signers.bob).createRedPacket(
        1,
        encryptedInput2.handles[0],
        encryptedInput2.inputProof,
        count,
        expireTime,
        "Second Red Packet"
      );

      // Check red packet count
      expect(await redPacket.redPacketCount()).to.equal(2);

      // Check both red packets
      const packet1 = await redPacket.getRedPacket(0);
      const packet2 = await redPacket.getRedPacket(1);

      expect(packet1.creator).to.equal(signers.alice.address);
      expect(packet1.packetType).to.equal(0);
      expect(packet1.message).to.equal("First Red Packet");

      expect(packet2.creator).to.equal(signers.bob.address);
      expect(packet2.packetType).to.equal(1);
      expect(packet2.message).to.equal("Second Red Packet");

      // Claim from both red packets
      await redPacket.connect(signers.charlie).claimRedPacket(0);
      await redPacket.connect(signers.deployer).claimRedPacket(1);

      // Check remaining counts
      const updatedPacket1 = await redPacket.getRedPacket(0);
      const updatedPacket2 = await redPacket.getRedPacket(1);

      expect(updatedPacket1.remainingCount).to.equal(1);
      expect(updatedPacket2.remainingCount).to.equal(1);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle non-existent red packet", async function () {
      const packetInfo = await redPacket.getRedPacket(999);
      expect(packetInfo.exists).to.be.equal(false);

      const claimRecord = await redPacket.getClaimRecord(999, signers.alice.address);
      expect(claimRecord.exists).to.be.equal(false);

      expect(await redPacket.isRedPacketActive(999)).to.be.equal(false);
    });

    it("Should handle claiming from non-existent red packet", async function () {
      await expect(
        redPacket.connect(signers.alice).claimRedPacket(999)
      ).to.be.revertedWithCustomError(redPacket, "RedPacketNotFound");
    });
  });
});
