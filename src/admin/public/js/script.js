const SCOUTER_STATUS = {
    "NEW": 0, //scouters who have connected but have not sent their state data
    "WAITING": 1, //scouters not actively in the process of scouting (dont have the scouting ui open)
    "SCOUTING": 2, //scouters actively scouting a match
    "COMPLETE": 3,
    "TOOMANY": 4,
    "MATCHERROR": 5,
    "READY": 6,
}
const SCOUTER_STATUS_REVERSE = {
    "0": "NEW",
    "1": "WAITING",
    "2": "SCOUTING",
    "3": "COMPLETE",
    "4": "UNASSIGNED SCOUTER",
    "5": "NO MATCH ASSIGNED",
    "6": "READY TO SCOUT",
}

let scroll = false;

const scouters = {};

;(async () => {
    const authRequest = await fetch("./api/auth").then(res => res.json())

    if (authRequest.status !== 2) {
        const authModal = new Modal("small", false).header("Sign In")
        const accessCodeInput = createDOMElement("input", "access-input")
        accessCodeInput.placeholder = "Access Code"
        accessCodeInput.type = "password"
        accessCodeInput.addEventListener("keydown", (e) => {
            if (e.keyCode === 13) {
                validate(accessCodeInput.value, authModal)
            }
        })
        authModal.element.appendChild(accessCodeInput)
        authModal.action("Submit", async () => {
            validate(accessCodeInput.value, authModal)
        })
        authModal.action("Cancel", async () => {
            location.href = '/';
        })
    } else {
        await constructApp()
    }

    async function validate(accessCode, authModal) {
        const auth = await fetch("./api/auth", {
            headers: {
                Authorization: accessCode
            }
        }).then(res => res.json())

        if (auth.status === 1) {
            await constructApp(accessCode)
            authModal.modalExit()
        } else {
            new Popup("error", "Wrong Access Code")
        }
    }
})()

async function constructApp(accessCode) {
    await updateScouters(accessCode);
    setInterval(() => updateScouters(accessCode), 2500);

    await updateMatches(accessCode)
    setInterval(() => updateMatches(accessCode), 2500);

    document.querySelector("#start-scouting").addEventListener("click", () => {
        fetch("/admin/api/enterMatch", {
            headers: {
                Authorization: accessCode
            }
        });
        // console.log("ENTER MATCH!")
    })
    document.querySelector("#center-list").addEventListener("click", () => {
        scroll = true;
    })

    let infoModal = false
    document.querySelector("#info").addEventListener("click", () => {
        document.querySelector("#menu").classList.remove("expanded")
        if (!infoModal) {
            infoModal = true
            let info = new Modal("small", false).header("Instructions").text(`
                    Press start scouting to start scouting, scouting will automatically start when six scouters join. 
                    (Note: Pressing start will only progress the scouter past the wait screen, they still manually have to start the match.)\n
                    Use the menu buttons to navigate around Devil Scouting.
                    `)

            info.action("OK", async () => {
                closeInfoModal(info)
            })

        }
    })

    function closeInfoModal(modal) {
        modal.modalExit()
        infoModal = false
    }

    let menuExpanded = false

    document.querySelector("#admin-panel").classList.add("visible")
    document.querySelector("#menu").classList.add("visible")

    document.querySelector("#menu-icon").addEventListener("click", () => {
        if (menuExpanded) {
            document.querySelector("#menu").classList.remove("expanded")
        } else {
            document.querySelector("#menu").classList.add("expanded")
        }
        menuExpanded = !menuExpanded
    })
}

async function updateScouters(accessCode) { //scouter fetch interval (every 2.5s)
    let scouterList = await (await fetch("./api/scouters", {
        headers: {
            Authorization: accessCode
        }
    })).json();

    for (let scouter of scouterList) {
        if (scouter.timestamp in scouters) {
            scouters[scouter.timestamp].updateScouterElement(scouter.state);
        } else {
            if (scouter.state.status === SCOUTER_STATUS.COMPLETE || !scouter.state.connected) continue; //it's already submitted/disconnected, dont show it.
            scouters[scouter.timestamp] = new ScouterDisplay(scouter);
        }
        if (scouter.state.status === SCOUTER_STATUS.COMPLETE || !scouter.state.connected) { //prune offline/complete scouters from the list
            setTimeout(() => {
                if (scouters[scouter.timestamp] && (scouters[scouter.timestamp].scouter.state.status === SCOUTER_STATUS.COMPLETE || !scouters[scouter.timestamp].scouter.state.connected)) {
                    scouters[scouter.timestamp].destruct();
                    delete scouters[scouter.timestamp]
                }
            }, 4000)
        }
    }
    // console.log(scouters)
    //prune scouters that no longer exist
    for (let timestamp in scouters) {
        if (!scouterList.find(x => x.timestamp = timestamp)) { //they no longer exist
            scouters[timestamp].destruct();
            delete scouters[timestamp];
        }
    }
}

async function updateMatches(accessCode) {
    let {allMatches, currentMatch} = await (await fetch(`/admin/api/matches`, {
        headers: {
            Authorization: accessCode
        }
    })).json();

    //clear matches view
    document.querySelector("#match-list").innerHTML = "";

    //rebuild matches view
    for (let match of allMatches) {
        let matchElement = document.createElement("div");
        matchElement.classList.add("match");
        matchElement.innerHTML = `
        <div class="match-header"><strong>${match.number}</strong> - ${match.match_string.toUpperCase().split("_")[0]}-<strong>${match.match_string.toUpperCase().split("_")[1]}</strong></div>
        <input type="checkbox" class="match-select">
        <div class="match-teams red"></div>
        <div class="match-teams blue"></div>
        `
        document.querySelector("#match-list").appendChild(matchElement);

        if (currentMatch.match_string == match.match_string) { //check the box if it is selected
            matchElement.querySelector(".match-select").checked = true;
            if (scroll) {
                matchElement.scrollIntoView({
                    block: "center"
                });
                scroll = false;
            }
        }

        //add the robot numbers to match
        for (let color of ["red", "blue"]) {
            for (let robotNumber of match.robots[color]) {
                let text = document.createElement("div");
                text.innerText = robotNumber;
                matchElement.querySelector(`.match-teams.${color}`).appendChild(text)
            }
        }

        //checkbox functionality
        let checkbox = matchElement.querySelector(".match-select")
        checkbox.addEventListener("input", () => {
            if (!checkbox.checked) { //if its already selected, do nothing
                checkbox.checked = true;
                return;
            }

            checkbox.checked = false; //set it to unchecked while processing the request

            //send a post request with the new match
            fetch("/admin/api/setMatch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: accessCode
                },
                body: JSON.stringify(match),
            }).then((res) => res.json()).then((success) => {
                if (success === true) { //if the match is successfully updated on the server-side
                    new Popup("success", `Match ${match.number} - ${match.match_string.toUpperCase()} Selected!`, 2000);
                    for (let box of document.querySelectorAll(".match .match-select")) { //deselect all boxes
                        box.checked = false;
                    }
                    checkbox.checked = true; //select the correct box
                } else {
                    new Popup("error", "Failed to Select Match!");
                }
            }).catch(e => new Popup("error", "Failed to Select Match!"));
        })
    }
}

class ScouterDisplay {
    scouterElement;
    scouter;

    constructor(scouter) {
        this.scouter = scouter;

        this.scouterElement = document.createElement("div");
        this.scouterElement.innerHTML = `
        <div class="match-number"></div>
        <div class="scouter-id"></div>
        <div class="robot-number"></div>
        <div class="scouter-status"></div>
        `;
        this.scouterElement.classList.add("scouter");

        document.querySelector("#scouter-list").appendChild(this.scouterElement);

        this.updateScouterElement();

    }

    updateScouterElement(state) {

        //update state
        this.scouter.state = state || this.scouter.state;

        //write all text
        this.scouterElement.querySelector(".scouter-id").innerText = this.scouter.state.scouterId;
        if (this.scouter.state.matchNumber != "") {
            this.scouterElement.querySelector(".match-number").innerText = this.scouter.state.matchNumber;
        } else {
            this.scouterElement.querySelector(".match-number").innerText = "0";
        }

        if (this.scouter.state.robotNumber != "" || this.scouter.state.robotNumber == "undefined") {
            this.scouterElement.querySelector(".robot-number").innerText = this.scouter.state.robotNumber;
        } else {
            this.scouterElement.querySelector(".robot-number").innerText = ""

        }

        //update color
        const SCOUTER_STATUS_COLOR = {
            "0": "var(--text)", //NEW
            "1": "#ffa500", //WAITING
            "2": "var(--accent)", //SCOUTING
            "3": "var(--green)", //COMPLETE
            "4": "var(--text)",
            "5": "var(--error)",
            "6": "var(--ready)"
        }
        const DISCONNECTED_COLOR = "var(--error)";

        if (this.scouter.state.status == SCOUTER_STATUS.NEW) {
            this.scouterElement.style.display = "none";
        } else {
            this.scouterElement.style.display = "flex";
        }

        if (!this.scouter.state.connected && !(this.scouter.state.status == SCOUTER_STATUS.COMPLETE)) { //disconneted and not complete
            this.scouterElement.querySelector(".scouter-status").style.color = DISCONNECTED_COLOR;
            this.scouterElement.style.borderColor = DISCONNECTED_COLOR;
            this.scouterElement.querySelector(".match-number").style.backgroundColor = DISCONNECTED_COLOR;
            this.scouterElement.querySelector(".match-number").style.borderColor = DISCONNECTED_COLOR;
            this.scouterElement.querySelector(".scouter-status").innerText = "DISCONNECTED";
        } else {
            this.scouterElement.querySelector(".scouter-status").style.color = SCOUTER_STATUS_COLOR[this.scouter.state.status];
            this.scouterElement.style.borderColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
            this.scouterElement.querySelector(".match-number").style.backgroundColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
            this.scouterElement.querySelector(".match-number").style.borderColor = SCOUTER_STATUS_COLOR[this.scouter.state.status];
            this.scouterElement.querySelector(".scouter-status").innerText = SCOUTER_STATUS_REVERSE[this.scouter.state.status];
        }
    }

    destruct() {
        this.scouterElement.parentElement.removeChild(this.scouterElement);
    }
}