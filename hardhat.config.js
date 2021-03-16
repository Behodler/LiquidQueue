require("@nomiclabs/hardhat-waffle");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});


task("0x0", "prints full zero address", async () => {
  console.log('zero address: ' + await ethers.constants.AddressZero)
});

task("units", "10^18", async () => {
  console.log('ETH: 1000000000000000000')
  console.log('FINNEY: 1000000000000000')
  console.log('10 SZABO: 10000000000000')
  console.log('100 ETH: 100000000000000000000')
  console.log('1000 ETH: 1000000000000000000000')
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.7.6",
  networks: {
    hardhat: {
      gasPrice: 1,
      gasMultiplier: 20,
      gas: 95000000,
      blockGasLimit: 95000000
    }
  }
};

