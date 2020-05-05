const socket = io()

let joinBtn = document.getElementById("join")
let createBtn = document.getElementById("create")
let menuEl = document.getElementById("menu")
let gameEl = document.getElementById("game")
let chatEl = document.getElementById("chat")
let input = document.getElementById("msg-input")

socket.on("join-fail", (err) => { alert(err) })
socket.on("joined", (game) => {
    let id = socket.id
    chatEl.innerHTML += `<span class="status-msg">Wating for host to start game...</span><br>`
    menuEl.style.display = "none"
    gameEl.style.display = "block"
    main(game)
})

socket.on("game-created", (game) => {
    let id = socket.id
    chatEl.innerHTML += `<span class="status-msg">Type #start to start the game.</span><br>`
    menuEl.style.display = "none"
    gameEl.style.display = "block"
    main(game)
})

const main = (gameID) => {

    document.title = gameID + " — Werewolf"

    // Messages
    let msgInput = ""
    window.onkeydown = (e) => {
        if (e.metaKey) return
        switch (e.key) {
            case "Enter":
                if (!msgInput.startsWith("#")) socket.emit("msg", msgInput)
                else socket.emit("cmd", msgInput.substr(1))
                msgInput = ""
                input.innerText = ""
                break
            case "Backspace":
                msgInput = msgInput.substr(0, msgInput.length - 1)
                input.innerText = msgInput
                break
                
            default:
                if (e.key.length == 1) {
                    msgInput += e.key
                    input.innerText += e.key
                    if (msgInput[msgInput.length - 2] == " ") {
                        msgInput = msgInput.substr(0, msgInput.length)
                        input.innerText = msgInput
                    }
                }
                break
        }

        if (msgInput.startsWith("#")) {
            input.classList.add("status-msg")
        } else {
            input.classList.remove("status-msg")
        }
    }

    socket.on("msg", (msg, user, game) => {
        if (game == gameID) chatEl.innerHTML += `<<span class="player-name">${user}</span>> ${msg}<br>`
    })
    socket.on("player-join", (user, game) => {
        if (game == gameID) chatEl.innerHTML += `<span class="player-name">${user}</span> joined.<br>`
    })

    socket.on("status-msg", (msg, game) => {
        if (game == gameID) chatEl.innerHTML += `<span class="status-msg">${msg}</span><br>`
    })
    socket.on("win-msg", (msg, game) => {
        if (game == gameID) chatEl.innerHTML += `<span class="win-msg">${msg}</span><br>`
    })

    socket.on("set-role", (role) => {
        switch (role) {
            case enums.roles.DEAD:
                chatEl.innerHTML += `<span class="status-msg">You are dead. :(</span><br>`
                break

            case enums.roles.NOTASSINGED:
                chatEl.innerHTML += `<span class="status-msg">You are a nothing. This is probibly a bug.</span><br>`
                break

            default:
                chatEl.innerHTML += `<span class="status-msg">You are a ${role}.</span><br>`
                break
        }
    })

    socket.on("open-url", (url) => {
        window.open(url)
    })
}

joinBtn.onclick = () => {
    let name = prompt("What's your name?")
    let gameID = prompt("Enter a game ID to join")
    socket.emit("join-game", {name, gameID})
}

createBtn.onclick = () => {
    let name = prompt("What's your name?")
    let gameID = prompt("Enter a game ID to join")
    socket.emit("create-game", { name, gameID })
}