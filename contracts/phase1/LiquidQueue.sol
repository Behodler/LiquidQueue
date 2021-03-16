// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "../uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../openzeppelin/Ownable.sol";
import "../openzeppelin/IERC20.sol";

/*
RULES:
1. A queue that has been stagnat for a set period of time starts rewarding EYE per queue place. Will use Nimrodel logic for this
2. We measure queue velocity by taking a moving average. If it exceeds a threshold, new LP entrants are burnt. The burn increases for each entrant underwhich it exceeds the threshold
3. The queue is fixed in length but can be resized by admin. This is likely just a temporary measure. 
*/
contract LiquidQueue is Ownable {
    address public mintingModule;
    bool public paused; // only for alpha queue.
    event queued(address indexed lp, uint256 amount, address holder);
    event popped(address indexed lp, uint256 amount, address holder);

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
        uint8 targetVelocity;
        uint8 size;
        address eye;
        uint256 stagnationRewardTimeout;
        uint256 eyeReward;
    }

    struct RainState {
        uint256 startTime;
        uint256 endTime; //joins after 1this are not paid
    }

    QueueConfig queueConfig;
    QueueState queueState;

    function pause(bool paws) public onlyOwner {
        paused = paws; // pores
    }

    function setMintingModule(address m) public onlyOwner {
        mintingModule = m;
    }

    function configure(
        uint8 targetVelocity,
        uint8 size,
        address eye,
        uint256 stagnationRewardTimeout,
        uint256 eyeReward
    ) public onlyOwner {
        require(
            size >= queueState.queue.length,
            "LIQUID QUEUE: pop queue to resize."
        );
        queueConfig.size = size;
        queueConfig.targetVelocity = targetVelocity;
        if (queueConfig.eye != address(0)) {
            require(
                queueConfig.eye == eye ||
                    queueState.queue.length == 0 ||
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
    }

    //take reward, advance queue structure, pop out end of queue
    function join(address LP, address recipient)
        public
        onlyMintingModule
        mustBeUnpaused
    {
        //pull in the minted LP from the minting module
        IUniswapV2Pair pair = IUniswapV2Pair(LP);
        uint256 balance = pair.balanceOf(mintingModule);
        pair.transferFrom(mintingModule, address(this), balance);

        //calculate current velocity. If it was low, turn off LP burn, otherwise set high.
        uint256 newEntryTimeStamp = block.timestamp;
        uint256 durationSinceLast = 0;
        if (queueState.queue.length > 0) {
            durationSinceLast =
                newEntryTimeStamp -
                queueState.queue[queueState.entryIndex].joinTimeStamp;
            queueState.velocity += (durationSinceLast) / queueConfig.size;
            queueState.velocity -=
                queueState.queue[queueState.lastIndex].durationSinceLast /
                queueConfig.size;

            //set LP burn ratio for next preson to leave
            if (queueState.velocity > queueConfig.targetVelocity) {
                queueState.burnRatio = queueState.burnRatio < 49
                    ? queueState.burnRatio + 1
                    : 49;
            } else {
                queueState.burnRatio = 0;
            }
        }

        if (queueState.eyeActive) {
            queueState.eyeHeight += durationSinceLast / queueConfig.eyeReward;
            if (queueState.velocity > queueConfig.targetVelocity) {
                queueState.eyeActive = false;
                queueState.criticalVelocityStart = 0;
            }
        }

        if (
            queueState.velocity < queueConfig.targetVelocity &&
            !queueState.eyeActive
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

        Batch memory leaver = queueState.queue[queueState.lastIndex];
        Batch memory joiner =
            Batch({
                recipient: recipient,
                LP: LP,
                amount: (balance * (queueState.burnRatio)) / 100,
                joinTimeStamp: block.timestamp,
                durationSinceLast: durationSinceLast,
                eyeHeightAtJoin: queueState.eyeHeight
            });

        payLeaver(leaver);

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

    //Note: to save gas, pop removes the latest batch in the queue, not the oldest batch
    function pop() public onlyOwner mustBePaused {
        payLeaver(queueState.queue[queueState.entryIndex]);
        queueState.queue.pop();
    }

    function payLeaver(Batch memory leaver) internal {
        IERC20(leaver.LP).transfer(leaver.recipient, leaver.amount);
        uint256 eyeReward = queueState.eyeHeight - leaver.eyeHeightAtJoin;
        if (eyeReward > 0)
            IERC20(queueConfig.eye).transfer(
                leaver.recipient,
                queueState.eyeHeight - leaver.eyeHeightAtJoin
            );

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
