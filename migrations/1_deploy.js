const UniswapFactory = artifacts.require("UniswapV2Factory");
const WETH = artifacts.require('WETH')
const UniswapRouter = artifacts.require('UniswapV2Router02')
const MockToken = artifacts.require('MockToken')


const LiquidQueue = artifacts.require('LiquidQueue')
const MintingModule = artifacts.require('MintingModule')
const Reward = artifacts.require('Reward')
const Sluicegate = artifacts.require('SluiceGate')

const MockIronCrown = artifacts.require("MockIronCrown")
const zero = '0x0000000000000000000000000000000000000000'
const fs = require('fs')
const pairJSON = JSON.parse(fs.readFileSync('../build/contracts/UniswapV2Pair.json', 'utf-8'))

module.exports = async function (deployer, network, accounts) {
    let deploymentObject = JSON.parse(fs.readFileSync('/home/justin/weidai ecosystem/LiquidQueue/deploymentObject.json', "utf-8"))

    let wethInstance, factoryInstance, rewardInstance, ironCrownInstance, routerInstance, eyeInstance, daiInstance, scxInstance
    let liquidQueueInstance, mintingModuleInstance, sluiceGateInstance
    if (network === 'development') {
        //uniswap
        await deployer.deploy(WETH)
        wethInstance = await WETH.deployed()

        await deployer.deploy(UniswapFactory, accounts[0])
        factoryInstance = await UniswapFactory.deployed()
        await deployer.deploy(UniswapRouter, factoryInstance.address, wethInstance.address)
        routerInstance = await UniswapRouter.deployed()


        await deployer.deploy(Reward)
        rewardInstance = await Reward.deployed()

        //mock tokens
        scxInstance = await MockToken.new("SCX", "SCX", rewardInstance.address, true)
        eyeInstance = await MockToken.new("EYE", "EYE", accounts[0], false)
        daiInstance = await MockToken.new("DAI", "DAI", accounts[0], false)
        await scxInstance.mint(accounts[0], '10000000000000000000')
        await eyeInstance.mint(accounts[0], '10000000000000000000')
        await daiInstance.mint(accounts[0], '10000000000000000000')


        //seed reward contract
        await scxInstance.mint(rewardInstance.address, '250000000000000000000')
        await eyeInstance.mint(rewardInstance.address, '10000000000000000000000')


        //create eyeWeth pool
        await factoryInstance.createPair(eyeInstance.address, wethInstance.address)
        const eyeWeth = await factoryInstance.getPair(eyeInstance.address, wethInstance.address)
        await eyeInstance.mint(eyeWeth, '10000000000000000000000')
        await wethInstance.deposit({ from: accounts[0], value: '200030000000000' })
        await wethInstance.transfer(eyeWeth, '200030000000000')

        const eyeWethLP = new web3.eth.Contract(pairJSON.abi, eyeWeth)
        let gas = await eyeWethLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        console.log('gas: ' + gas)
        await eyeWethLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        console.log('EYE_WETH total supply: ' + (await eyeWethLP.methods.totalSupply().call()).toString())
        console.log('EYE WETH address ' + eyeWeth)

        //Morgoth
        await deployer.deploy(MockIronCrown, scxInstance.address, rewardInstance.address)
        ironCrownInstance = await MockIronCrown.deployed()


        //LiquidQueue
        await deployer.deploy(LiquidQueue)
        liquidQueueInstance = await LiquidQueue.deployed()
        await liquidQueueInstance.setReward(rewardInstance.address)

        await deployer.deploy(MintingModule, daiInstance.address, scxInstance.address, eyeInstance.address, routerInstance.address, factoryInstance.address, liquidQueueInstance.address)
        mintingModuleInstance = await MintingModule.deployed()

        await mintingModuleInstance.seed(factoryInstance.address, routerInstance.address, rewardInstance.address, 20)
        await liquidQueueInstance.setMintingModule(mintingModuleInstance.address)

        await liquidQueueInstance.configure(10, 21, eyeInstance.address, 10000, '35000000000000000', false)

        const scx_eye = await factoryInstance.getPair(scxInstance.address, eyeInstance.address)
        const scx_weth = await factoryInstance.getPair(wethInstance.address, scxInstance.address)
        const eye_dai = await factoryInstance.getPair(daiInstance.address, eyeInstance.address)
        const eye_weth = await factoryInstance.getPair(daiInstance.address, eyeInstance.address) // for entrance

        await eyeInstance.mint(scx_eye, '1000000000000000000000')
        await scxInstance.mint(scx_eye, '20000000000000000000001')

        await eyeInstance.mint(eye_dai, '1000000000000000000000')
        await daiInstance.mint(eye_dai, '5600000000000000000000')

        await scxInstance.mint(scx_weth, '1000000000000000000000')
        const newWeth = '300000000000000000'
        await wethInstance.deposit({ value: newWeth, from: accounts[0] })
        await wethInstance.transfer(scx_weth, newWeth, { from: accounts[0] })

        const scx_eyeLP = new web3.eth.Contract(pairJSON.abi, scx_eye)
        gas = await scx_eyeLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        await scx_eyeLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        const totalSCXEYESupply = (await scx_eyeLP.methods.totalSupply().call()).toString()
        console.log('SCX_EYE LP total Supply: ' + totalSCXEYESupply)

        const scx_wethLP = new web3.eth.Contract(pairJSON.abi, scx_weth)
        gas = await scx_wethLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        await scx_wethLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        const totalSCXWETHSupply = (await scx_wethLP.methods.totalSupply().call()).toString()
        console.log('SCX_WETH LP total Supply: ' + totalSCXWETHSupply)

        const eye_daiLP = new web3.eth.Contract(pairJSON.abi, eye_dai)
        gas = await eye_daiLP.methods.mint(accounts[0]).estimateGas({ from: accounts[0] })
        await eye_daiLP.methods.mint(accounts[0]).send({ from: accounts[0], gas: gas })
        const totaEYEDAISupply = (await eye_daiLP.methods.totalSupply().call()).toString()
        console.log('EYE_DAI LP total Supply: ' + totaEYEDAISupply)


        await deployer.deploy(Sluicegate, scx_eye, eye_weth, eyeInstance.address)


        sluiceGateInstance = await Sluicegate.deployed()
        let contracts = {
            LiquidQueue: liquidQueueInstance.address,
            MintingModule: mintingModuleInstance.address,
            Reward: rewardInstance.address,
            SluiceGate: sluiceGateInstance.address,
            UniswapV2Factory: factoryInstance.address,
            EYE: eyeInstance.address,
            WETH: wethInstance.address,
            SCX: scxInstance.address,
            DAI: daiInstance.address
        }
        deploymentObject[network] = contracts
        fs.writeFileSync("deploymentObject.json", JSON.stringify(deploymentObject, null, 4), "utf-8")
    }
};