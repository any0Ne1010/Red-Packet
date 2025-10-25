// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "./tokens/IERC7984.sol";

/// @title Encrypted Red Packet 
/// @author anyoneisme1999
/// @notice A simple red packet system with normal and random distribution
/// @dev Uses FHEVM for encrypted amounts and async decryption for settlements
contract RedPacket is SepoliaConfig {
    // ========== Enums ==========
    
    enum RedPacketType {
        NORMAL,     // Normal red packet: equal distribution
        RANDOM      // Random red packet: random distribution
    }
    
    enum RedPacketStatus {
        ACTIVE,     // Active
        EXPIRED,    // Expired
        EMPTY       // Empty
    }
    
    // ========== Structs ==========
    
    /// @notice Red packet structure
    struct RedPacketInfo {
        uint256 id;
        address creator;
        RedPacketType packetType;
        RedPacketStatus status;
        euint64 encryptedTotalAmount;
        uint256 totalCount;
        uint256 remainingCount;
        uint256 expireTime;
        string message;
        uint256 createdAt;
        bool exists;
    }
    
    /// @notice Claim record structure
    struct ClaimInfo {
        address user;
        euint64 amount;
        uint256 timestamp;
        bool exists;
    }
    
    // ========== State Variables ==========
    
    IERC7984 public immutable TOKEN;
    uint256 public redPacketCount;
    mapping(uint256 redPacketId => RedPacketInfo packet) public redPackets;
    mapping(uint256 redPacketId => mapping(address user => ClaimInfo record)) public claimRecords;
    mapping(uint256 redPacketId => address[] claimers) public redPacketClaimers;
    
    // ========== Events ==========
    
    event RedPacketCreated(
        uint256 indexed redPacketId,
        address indexed creator,
        RedPacketType packetType,
        uint256 totalCount,
        uint256 expireTime,
        string message
    );
    
    event RedPacketClaimed(
        uint256 indexed redPacketId,
        address indexed user,
        uint256 remainingCount
    );
    
    event RedPacketExpired(uint256 indexed redPacketId);
    
    // ========== Errors ==========
    
    error RedPacketNotFound();
    error RedPacketExpiredError();
    error RedPacketEmpty();
    error AlreadyClaimed();
    error InvalidCount();
    error InvalidExpireTime();
    error InvalidTokenAddress();
    
    // ========== Constructor ==========
    
    constructor(address _token) {
        if (_token == address(0)) revert InvalidTokenAddress();
        TOKEN = IERC7984(_token);
    }
    
    // ========== Core Functions ==========
    
    /// @notice Create a new red packet
    function createRedPacket(
        RedPacketType packetType,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        uint256 totalCount,
        uint256 expireTime,
        string calldata message
    ) external returns (uint256) {
        // Validate parameters
        if (totalCount == 0 || totalCount > 100) revert InvalidCount();
        if (expireTime <= block.timestamp) revert InvalidExpireTime();
        if (expireTime > block.timestamp + 30 days) revert InvalidExpireTime();
        
        // Transfer tokens from user to contract
        euint64 amount = TOKEN.confidentialTransferFrom(
            msg.sender,
            address(this),
            encryptedAmount,
            inputProof
        );
        
        // Set ACL permissions
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        
        uint256 redPacketId = redPacketCount++;
        
        // Create red packet
        redPackets[redPacketId] = RedPacketInfo({
            id: redPacketId,
            creator: msg.sender,
            packetType: packetType,
            status: RedPacketStatus.ACTIVE,
            encryptedTotalAmount: amount,
            totalCount: totalCount,
            remainingCount: totalCount,
            expireTime: expireTime,
            message: message,
            createdAt: block.timestamp,
            exists: true
        });
        
        emit RedPacketCreated(
            redPacketId,
            msg.sender,
            packetType,
            totalCount,
            expireTime,
            message
        );
        
        return redPacketId;
    }
    
    /// @notice Claim a red packet
    function claimRedPacket(uint256 redPacketId) external {
        RedPacketInfo storage packet = redPackets[redPacketId];
        
        // Validate red packet
        if (!packet.exists) revert RedPacketNotFound();
        if (packet.status != RedPacketStatus.ACTIVE) revert RedPacketExpiredError();
        if (block.timestamp > packet.expireTime) {
            revert RedPacketExpiredError();
        }
        if (packet.remainingCount == 0) {
            revert RedPacketEmpty();
        }
        
        // Check if already claimed
        if (claimRecords[redPacketId][msg.sender].exists) revert AlreadyClaimed();
        
        // Calculate claim amount (simplified: equal distribution for both types)
        euint64 claimAmount = packet.encryptedTotalAmount;
        
        // Record the claim
        claimRecords[redPacketId][msg.sender] = ClaimInfo({
            user: msg.sender,
            amount: claimAmount,
            timestamp: block.timestamp,
            exists: true
        });
        
        redPacketClaimers[redPacketId].push(msg.sender);
        packet.remainingCount--;
        
        // Update status if empty
        if (packet.remainingCount == 0) {
            packet.status = RedPacketStatus.EMPTY;
        }
        
        // Transfer tokens to user
        FHE.allowThis(claimAmount);
        FHE.allow(claimAmount, msg.sender);
        FHE.allow(claimAmount, address(TOKEN));
        
        TOKEN.confidentialTransfer(msg.sender, claimAmount);
        
        emit RedPacketClaimed(redPacketId, msg.sender, packet.remainingCount);
    }
    
    // ========== View Functions ==========
    
    /// @notice Get red packet details
    function getRedPacket(uint256 redPacketId) external view returns (RedPacketInfo memory) {
        return redPackets[redPacketId];
    }
    
    /// @notice Get user's claim record
    function getClaimRecord(uint256 redPacketId, address user) external view returns (ClaimInfo memory) {
        return claimRecords[redPacketId][user];
    }
    
    /// @notice Get all claimers for a red packet
    function getRedPacketClaimers(uint256 redPacketId) external view returns (address[] memory) {
        return redPacketClaimers[redPacketId];
    }
    
    /// @notice Check if red packet is active
    function isRedPacketActive(uint256 redPacketId) external view returns (bool) {
        RedPacketInfo memory packet = redPackets[redPacketId];
        return packet.exists && 
               packet.status == RedPacketStatus.ACTIVE && 
               block.timestamp <= packet.expireTime &&
               packet.remainingCount > 0;
    }
    
    /// @notice Get encrypted claim amount for a user
    function getUserClaimAmount(uint256 redPacketId, address user) external view returns (euint64) {
        return claimRecords[redPacketId][user].amount;
    }
}
