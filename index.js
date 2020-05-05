const express = require("express")
const socketio = require("socket.io")

const enums = require("./assets/enums")

const app = express()
const http = require("http").createServer(app)
const io = socketio(http)

let games = {}
let gameConnections = {}

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html")
})

app.use("/assets", express.static("assets"))

io.on("connection", (socket) => {
    let name = ""

    socket.on("join-game", (dataRaw) => {
        let game = games[dataRaw.gameID]
        let data = {
            id: socket.id,
            role: enums.roles.NOTASSINGED,
            isHost: false
        }

        let failCode = ""

        if (!game || Object.keys(game.players).indexOf(dataRaw.name) != -1 || 
            dataRaw.name.includes("@") || 
            dataRaw.name.includes("#") || 
            dataRaw.name.includes(":") || 
            dataRaw.name.includes(".") || 
            dataRaw.name.startsWith(" ") || 
            dataRaw.name.startsWith("*") || 
            dataRaw.name == "") 
            failCode = "That name is invalid or already in use."
        if (!game) failCode = "Game not found."

        if (failCode != "") {
            socket.emit("join-fail", failCode)
            return
        }
        Object.values(game.players).forEach(player => {
            player.socket.emit("player-join", { ...data, name: dataRaw.name })
        })

        games[dataRaw.gameID].players[dataRaw.name] = { ...data, socket }
        gameConnections[socket.id] = dataRaw.gameID
        name = dataRaw.name
        socket.emit("joined", dataRaw.gameID)
    })

    socket.on("create-game", (data) => {
        let playerData = {
            id: socket.id,
            role: enums.roles.NOTASSINGED,
            socket,
            isHost: true
        }
        if (games[data.gameID]) {
            socket.emit("join-fail", "Game ID invalid.")
            return
        }
        let game = {
            players: {[data.name]: playerData},
            status: {
                time: enums.times.WAIT,
                action: enums.actions.NONE
            }
        }

        gameConnections[socket.id] = data.gameID
        games[data.gameID] = game
        name = data.name
        socket.emit("game-created", data.gameID)
    })

    socket.on("msg", (msg) => {
        let gameID = gameConnections[socket.id]
        if (games[gameID].players[name].role != enums.roles.DEAD) io.emit("msg", msg, name, gameID)
    })

    socket.on("cmd", (msg) => {
        let gameID = gameConnections[socket.id]
        let game = games[gameID]
        let isHost = game.players[name].isHost
        let role = game.players[name].role


        let inputs = msg.split(" ")
        let cmd = inputs.shift()
        
        switch (cmd) {
            case "start":
                if (isHost) {
                    io.emit("status-msg", `${name} has started the game. Get ready...`)

                    let done = []
                    let werewolfsSkipped = 0
                    for (let i = 0; i < 2; i++) {
                        if (game.players.length - done.length > 2) { 
                            let playerIndex = Math.floor(Math.random() * (game.players.length))
                            if (done.indexOf(playerIndex) == -1) {
                                done.push(playerIndex)
                                let player = Object.values(game.players)[playerIndex]
                                player.socket.emit("set-role", enums.roles.WEREWOLF)
                                player.role = enums.roles.WEREWOLF
                            } else {
                                i--
                            }
                        } else {
                            werewolfsSkipped++
                        }
                    }

                    Object.values(game.players).forEach((player, i) => {
                        if (done.indexOf(i) == -1) {
                            player.socket.emit("set-role", enums.roles.VILLAGER)
                            player.role = enums.roles.VILLAGER
                        }
                    })

                    if (werewolfsSkipped > 0) {
                        io.emit("status-msg", `There are ${2 - werewolfsSkipped} werewolf(s). This is beacuse of a shortage of players.`)
                    }

                    game.status.time = enums.times.DAY
                    game.status.action = enums.actions.VOTE
                }
                break
                
            case "whoami":
                if (game.status.time != enums.times.WAIT) {
                    switch (role) {
                        case enums.roles.DEAD:
                            socket.emit("status-msg", `You are dead. :(`)
                            break

                        case enums.roles.NOTASSINGED:
                            socket.emit("status-msg", `You are not part of this game.`)
                            break
                    
                        default:
                            socket.emit("status-msg", `You are a ${role}.`)
                            break
                    }
                } else {
                    socket.emit("status-msg", `I do not know. Ask the randomness...`)
                }
                break

            case "google":
                socket.emit("open-url", `https://google.com/search?q=${inputs[0]}`)
                io.emit("status-msg", `${name} looked up ${inputs[0]}`)
        }
    })

    socket.on("disconnect", () => {
        let gameID = gameConnections[socket.id]
        let game = games[gameID]
        console.log("Player disconnect from", gameConnections[socket.id], gameConnections)
        if (!game) return

        delete gameConnections[socket.id]

        if (game.players[name].isHost) {
            delete games[gameID]
        } else {
            delete game.players[name]
        }
    })
})

http.listen(process.env.PORT || 3000)