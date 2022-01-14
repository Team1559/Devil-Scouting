let actionQueue = [];
let devEnd

(async () => {
    config = await config
    //initiate timing
    let time = config.timing.totalTime;
    let timerActive = false;
    //create grid
    const grid = document.querySelector("#match-scouting .button-grid");
    grid.style.gridTemplateColumns = `repeat(${config.layout.gridColumns}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${config.layout.gridRows}, 1fr)`;

    
    //build buttons
    const layers = deepClone(config.layout.layers);
    const buttons = layers.flat();

    const buttonBuilders = { //an object to give buttons type specific things, button type: function (button)
        "action": (button) => {
            //add an action to the actionQueue
            button.element.addEventListener("click", () => { 
                actionQueue.push({
                    "id": button.id,
                    "ts": time,
                })
                doExecutables(button)
            })
        },

        "undo": (button) => {
            button.element.addEventListener("click", () => {
                const undoneId = actionQueue.pop().id //remove the last action from the action queue 
                const undoneButton = buttons.find(x => x.id === undoneId);

                //special case for match-control buttons which have extra undo funcitonality without executables
                if (undoneButton.type === "match-control") {
                    time = config.timing.totalTime; //reset timer
                    clearInterval(undoneButton.timerInterval); //clear the timing interval
                    undoneButton.element.innerText = "Start Match";
                    timerActive = false;
                    showLayer(0);
                }

                for (const executable of undoneButton.executables) {
                    executables[executable.type].reverse(undoneButton,layers,...executable.args) //reverse any executables associated with the undone button
                }
                doExecutables(button)
            })
        },

        "none": (button) => {
            //add a temporary event to the action queue with no id which will be removed before the action queue is sent
            button.element.addEventListener("click", () => { 
                actionQueue.push({
                    "id": button.id,
                    "ts": time,
                    "temp": true
                })
                doExecutables(button)
            })
        },

        "match-control": (button) => {
            button.element.innerText = "Start Match";
            button.element.addEventListener("click", () => {
                // Handle click after timer runs out
                if (time <= 0) {
                    console.log("submitting")
                    LocalData.storeMatchTeamPerformance(new MatchTeamPerformance(actionQueue).data)
                }
                
                if (timerActive) return;
                
                actionQueue.push({ //create a temporary action queue so you can undo it
                    "id": button.id,
                    "ts": time,
                    "temp": true
                })

                let displayText = "";
                let start = Date.now()
                devEnd = () => {start = Date.now() - (config.timing.totalTime - 1)}
                const transitions = Object.keys(config.timing.timeTransitions).map(x => Number(x)).sort((a,b) => b - a);
                timerActive = true;
                button.timerInterval = setInterval(() => {
                    if (time <= transitions[0]) { //move to the next transition if it is time
                        displayText = config.timing.timeTransitions[transitions[0]].displayText;
                        showLayer(config.timing.timeTransitions[transitions[0]].layer);
                        transitions.shift()
                    }
                    if (time <= 0) {
                        buttons.filter(x => x.type === "match-control").forEach((b) => { //update all match-control buttons (even those in different layers)
                            b.element.innerText = "Match Complete";
                            setTimeout(() => {
                                b.element.innerText = "Submit Match";
                            }, 2000)
                        });
                        clearInterval(button.timerInterval); //clear the timing interval

                        return;
                    }
                    time = config.timing.totalTime - (Date.now() - start);
                    buttons.filter(x => x.type === "match-control").forEach((b) => { //update all match-control buttons (even those in different layers)
                        b.element.innerText = `${(time / 1000).toFixed(2)} | ${displayText}`;
                    });
                }, 10);
                doExecutables(button);
            })
        }
    }

    //create button objects in layers
    for (const layer of layers) {
        for (const button of layer) {
            button.element = document.createElement("div");
            
            //give the button element its properties
            button.element.innerText = button.displayText || button.id;
            button.element.classList.add("grid-button", ...button.class.split(" "));
            button.element.style.gridArea = button.gridArea.join(" / ");
            
            //apply type to button
            buttonBuilders[button.type](button);
            //add the button to the grid
            grid.appendChild(button.element);
        }
    }

    showLayer(0); //initially show layer 0

    function doExecutables(button) {
        for (const executable of button.executables) {
            console.log(executable,layers)
            executables[executable.type].execute(button, layers, ...executable.args);
        }
    }

    function showLayer(layer) {
        for (const b of buttons) {
            b.element.style.display = "none";
        }
        for (const b of layers[layer]) {
            b.element.style.display = "flex";
        }
    }

    // DATA
    class MatchTeamPerformance {
        data;

        constructor(actionQueue) {
            this.data = {
                matchId: `${ScoutingSync.state.matchNumber}-${ScoutingSync.state.robotNumber}-${ScoutingSync.state.scouterId}-${Math.random().toString(36).slice(-6)}`,
                timestamp: Date.now(),
                clientVersion: config.version,
                scouterId: ScoutingSync.state.scouterId, // from scouting-sync.js
                robotNumber: ScoutingSync.state.robotNumber, // from scouting-sync.js
                actionQueue: actionQueue
            }
        }
    }
})()