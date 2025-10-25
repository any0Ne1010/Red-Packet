import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployRedPacket: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying RedPacket contract...");

  // Get the deployed ConfidentialToken address
  const confidentialToken = await deployments.get("ConfidentialToken");
  console.log("Using ConfidentialToken at:", confidentialToken.address);

  const redPacketDeployment = await deploy("RedPacketMVP", {
    from: deployer,
    args: [confidentialToken.address],
    log: true,
    waitConfirmations: 1,
  });

  console.log("RedPacket deployed to:", redPacketDeployment.address);
  
  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: redPacketDeployment.address,
        constructorArguments: [confidentialToken.address],
      });
      console.log("RedPacket contract verified on Etherscan");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
};

export default deployRedPacket;
deployRedPacket.tags = ["RedPacketMVP"];
deployRedPacket.dependencies = ["ConfidentialToken"];
