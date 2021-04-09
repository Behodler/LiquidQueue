// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/IERC20.sol";
import "../facades/RewardLike.sol";

/*
RULES:
1. A queue that has been stagnant for a set period of time starts rewarding EYE per queue place. Will use Nimrodel logic for this
2. We measure queue velocity by taking a moving average. If it exceeds a threshold, new LP entrants are burnt. The burn increases for each entrant underwhich it exceeds the threshold
3. The queue is fixed in length but can be resized by admin. This is likely just a temporary measure. 
*/
contract LiquidQueue is Ownable {
    address public mintingModule;
    bool public paused; // only for alpha queue.
    event queued(address indexed lp, uint256 amount, address holder);
    event popped(address indexed lp, uint256 amount, address holder);
    RewardLike rewardContract;

    modifier onlyMintingModule {
        require(
            msg.sender == mintingModule,
            "LIQUID QUEUE: restricted function"
        );
        _;
    }

    modifier mustBeUnpaused {
        require(!paused, "LIQUID QUEUE: currently paused");
        _;
    }

    modifier mustBePaused {
        require(paused, "LIQUID QUEUE: currently unpaused");
        _;
    }

    struct Batch {
        address recipient;
        address LP;
        uint256 amount;
        uint256 joinTimeStamp;
        uint256 durationSinceLast;
        uint256 eyeHeightAtJoin;
    }

    struct QueueState {
        uint256 velocity; //joins per week
        uint256 burnRatio;
        uint256 eyeHeight;
        bool eyeActive;
        uint256 criticalVelocityStart;
        uint256 lastIndex; //old batches pop off the queue from here
        uint256 entryIndex; //new batches go here
        Batch[] queue;
        uint256 eyeStagnantDuration;
    }

    struct QueueConfig {
        uint24 targetVelocity;
        uint8 size;
        address eye;
        uint256 stagnationRewardTimeout;
        uint256 eyeReward;
        bool LPburnDisabled; // if behodler's listing of LPs is enough incentive to not unwind then no need for LP burning
    }

    QueueConfig queueConfig;
    QueueState queueState;

    constructor() {
        queueState.eyeActive = true;
    }

    function setReward(address r) public onlyOwner {
        rewardContract = RewardLike(r);
    }

    function pause() public onlyOwner {
        paused = true;
    }

    function unpause() public onlyOwner {
        paused = false;
    }

    function setMintingModule(address m) public onlyOwner {
        mintingModule = m;
    }

    function configure(
        uint24 targetVelocity,
        uint8 size,
        address eye,
        uint256 stagnationRewardTimeout,
        uint256 eyeReward,
        bool LPburnDisabled
    ) public onlyOwner {
        require(
            size >= queueState.queue.length,
            "LIQUID QUEUE: pop queue to resize."
        );
        queueConfig.size = size;
        queueConfig.targetVelocity = targetVelocity;
        if (queueConfig.eye != address(0)) {
            require(
                (queueConfig.eye == eye && queueState.queue.length == 0) ||
                    paused,
                "LIQUID QUEUE: Eye address currently locked"
            );
            uint256 durationSinceLast =
                queueState.queue.length > 0
                    ? block.timestamp -
                        queueState.queue[queueState.entryIndex].joinTimeStamp
                    : 0;
            queueState.eyeHeight += durationSinceLast * queueConfig.eyeReward;
        }
        queueConfig.eye = eye;
        queueConfig.stagnationRewardTimeout = stagnationRewardTimeout;
        queueConfig.eyeReward = eyeReward;
        queueConfig.LPburnDisabled = LPburnDisabled;
    }

    //take reward, advance queue structure, pop out end of queue. External users must enter through MintingModule.purchaseLP
    function join(address LP, address recipient)
        public
        onlyMintingModule
        mustBeUnpaused
    {
        //pull in the minted LP from the minting module
        IUniswapV2Pair pair = IUniswapV2Pair(LP);
        uint256 balance = pair.balanceOf(mintingModule);
        pair.transferFrom(mintingModule, address(this), balance);

        //calculate current velocity. If it is high, turn off LP burn.
        uint256 newEntryTimeStamp = block.timestamp;
        uint256 durationSinceLast = 0;
        if (queueState.queue.length > 0) {
            durationSinceLast =
                newEntryTimeStamp -
                queueState.queue[queueState.entryIndex].joinTimeStamp;
            queueState.velocity +=
                ((1 weeks) / (durationSinceLast + 1)) /
                queueConfig.size;
            if (queueState.queue.length == queueConfig.size) {
                uint256 leavingVelocity =
                    ((1 weeks) /
                        (queueState.queue[queueState.lastIndex]
                            .durationSinceLast + 1)) / queueConfig.size;
                uint256 existingVelocity = queueState.velocity;
                queueState.velocity = existingVelocity < leavingVelocity
                    ? 0 //queueState.velocity
                    : existingVelocity - leavingVelocity;
            }

            //set LP burn ratio for next preson to leave
            if (
                !queueConfig.LPburnDisabled &&
                queueState.velocity > queueConfig.targetVelocity &&
                queueState.queue.length == queueConfig.size
            ) {
                queueState.burnRatio = queueState.burnRatio < 49
                    ? queueState.burnRatio + 1
                    : 49;
            } else {
                queueState.burnRatio = 0;
            }
        }

        //if eye rewards are active but velocity picks up, disable eye rewards
        if (queueState.eyeActive) {
            queueState.eyeHeight += durationSinceLast * queueConfig.eyeReward;
            if (queueState.velocity > queueConfig.targetVelocity) {
                queueState.eyeActive = false;
                queueState.criticalVelocityStart = 0;
            }
        }

        //if velocity falls below target, after timeout set eye rewards to active
        if (
            queueState.velocity < queueConfig.targetVelocity &&
            !queueState.eyeActive &&
            queueState.queue.length > 0
        ) {
            if (queueState.criticalVelocityStart == 0)
                queueState.criticalVelocityStart = block.timestamp;
            else if (
                block.timestamp - queueState.criticalVelocityStart >
                queueConfig.stagnationRewardTimeout
            ) {
                queueState.eyeActive = true;
            }
        }

        if (queueState.queue.length == queueConfig.size) {
            Batch memory leaver = queueState.queue[queueState.lastIndex];
            payLeaver(leaver);
        }

        Batch memory joiner =
            Batch({
                recipient: recipient,
                LP: LP,
                amount: balance - ((balance * queueState.burnRatio) / 100),
                joinTimeStamp: block.timestamp,
                durationSinceLast: queueState.queue.length == 0
                    ? (1 weeks)
                    : durationSinceLast,
                eyeHeightAtJoin: queueState.eyeHeight
            });

        emit queued(joiner.LP, joiner.amount, joiner.recipient);
        if (queueState.queue.length < queueConfig.size) {
            queueState.queue.push(joiner);
            queueState.entryIndex = queueState.queue.length - 1;
        } else {
            queueState.entryIndex = circleIncrement(
                queueState.entryIndex,
                queueConfig.size
            );
            queueState.lastIndex = circleIncrement(
                queueState.lastIndex,
                queueConfig.size
            );
            queueState.queue[queueState.entryIndex] = joiner;
        }
    }

    //Only use this if you're planning on destroying or resetting the queue entirely
    //Note: to save gas, pop removes the latest batch in the queue, not the oldest batch
    function pop() public onlyOwner mustBePaused {
        payLeaver(queueState.queue[queueState.entryIndex]);
        queueState.queue.pop();
        uint256 newLength = queueState.queue.length;
        queueState.entryIndex = queueState.entryIndex % newLength;
        queueState.lastIndex = queueState.lastIndex % newLength;
    }

    function getQueueData()
        public
        view
        returns (
            uint256 length,
            uint256 last,
            uint256 entryIndex,
            uint256 velocity,
            uint256 burnRatio,
            bool eyeActive,
            uint256 eyeReward,
            uint256 eyeHeight
        )
    {
        return (
            queueState.queue.length,
            queueState.lastIndex,
            queueState.entryIndex,
            queueState.velocity,
            queueState.burnRatio,
            queueState.eyeActive,
            queueConfig.eyeReward,
            queueState.eyeHeight
        );
    }

    function getBatch(uint256 index)
        external
        view
        returns (
            address recipient,
            address LP,
            uint256 amount,
            uint256 joinTimeStamp,
            uint256 durationSinceLast,
            uint256 eyeHeightAtJoin,
            bool validIndex
        )
    {
        Batch memory batch;
        if (queueState.queue.length > index) {
            batch = queueState.queue[index];
            recipient = batch.recipient;
            LP = batch.LP;
            amount = batch.amount;
            joinTimeStamp = batch.joinTimeStamp;
            durationSinceLast = batch.durationSinceLast;
            eyeHeightAtJoin = batch.eyeHeightAtJoin;
            validIndex = true;
        }
    }

    function payLeaver(Batch memory leaver) internal {
        IERC20(leaver.LP).transfer(leaver.recipient, leaver.amount);
        uint256 eyeReward = (queueState.eyeHeight - leaver.eyeHeightAtJoin); //no need for overflow check. eyeHeightAtJoin can't be greater than eyeHeight
        if (eyeReward > 0) {
            //don't fail if unable to pay staking reward.
            if (
                rewardContract.requestSlowQueueReward(
                    queueConfig.eye,
                    eyeReward
                )
            ) IERC20(queueConfig.eye).transfer(leaver.recipient, eyeReward);
        }
        emit popped(leaver.LP, leaver.amount, leaver.recipient);
    }

    function circleIncrement(uint256 value, uint256 max)
        internal
        pure
        returns (uint256)
    {
        return (value + 1) % max;
    }
}
