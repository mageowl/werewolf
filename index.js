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
            isHost: false,
            votes: 0
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
            isHost: true,
            votes: 0
        }
        if (games[data.gameID]) {
            socket.emit("join-fail", "Game ID invalid.")
            return
        }
        let game = {
            players: {[data.name]: playerData},
            status: {
                time: enums.times.WAIT,
                action: enums.actions.NONE,
                werewolfsLeft: -1,
                playersLeft: -1
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
                    io.emit("status-msg", `${name} has started the game. Get ready...`, gameID)

                    let done = []
                    let werewolfsSkipped = 0
                    for (let i = 0; i < 2; i++) {
                        if (Object.keys(game.players).length - done.length > 3) { 
                            let playerIndex = Math.floor(Math.random() * (Object.keys(game.players).length))
                            if (done.indexOf(playerIndex) == -1) {
                                done.push(playerIndex)
                                let player = Object.values(game.players)[playerIndex]
                                console.log(player, Object.values(game.players), playerIndex)
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

                    game.status.werewolfsLeft = 2 - werewolfsSkipped
                    game.status.playersLeft = Object.keys(game.players).length

                    if (werewolfsSkipped > 0) {
                        io.emit("status-msg", `There are ${2 - werewolfsSkipped} werewolf(s). This is beacuse of a shortage of players.`, gameConnections[socket.id])
                    }

                    game.status.time = enums.times.DAY
                    game.status.action = enums.actions.VOTE
                }
                break
                
            case "whoami":
                if (game.status.time != enums.times.WAIT) {
                    switch (role) {
                        case enums.roles.DEAD:
                            socket.emit("status-msg", `You are dead. :(`, gameID)
                            break

                        case enums.roles.NOTASSINGED:
                            socket.emit("status-msg", `You are currently not part of this game.`, gameID)
                            break
                    
                        default:
                            socket.emit("status-msg", `You are a ${role}.`, gameID)
                            break
                    }
                } else {
                    socket.emit("status-msg", `I do not know. Ask the randomness...`, gameID)
                }
                break

            case "google":
                socket.emit("open-url", `https://google.com/search?q=${inputs.join(" ")}`)
                io.emit("status-msg", `${name} looked up ${inputs[0]}`, gameConnections[socket.id])
                break
            
            case "player":
                let playerName = inputs.join(" ")
                let playerIndex = Object.keys(game.players).indexOf(playerName)
                if (playerIndex == -1 || role == enums.roles.DEAD) return
                let player = Object.values(game.players)[playerIndex]
                if (player.role == enums.roles.DEAD) return

                switch (game.status.action) {
                    case enums.actions.VOTE:
                        if (game.status.time != enums.times.DAY) return
                        if (player.votes == 0) io.emit("status-msg", `${name} accused ${playerName}. To second this, type #player ${playerName}.`, gameID)
                        else io.emit("status-msg", `${name} seconded the vote for ${playerName}.`, gameID)
                        player.votes++
                        if (player.votes > Math.floor(game.status.playersLeft / 2)) {
                            io.emit("status-msg", `There are ${player.votes} votes for ${playerName}. They will be killed.`, gameID)
                            player.socket.emit("status-msg", "You are dead now.", gameID)
                            player.role = enums.roles.DEAD
                            game.status.playersLeft--
                            game.status.time = enums.times.NIGHT
                            game.status.action = enums.actions.WEREWOLFS

                            if (player.role == enums.roles.WEREWOLF) game.status.werewolfsLeft--
                            if (game.status.werewolfsLeft == 0) {
                                game.status.time = enums.times.VILLAGERS_WON
                                game.status.action = enums.actions.NONE
                                io.emit("win-msg", `The last werewolf, ${playerName}, has been killed. The village is safe at last!`, gameID)
                            } else {
                                io.emit("status-msg", `Day turns to dusk. Night is coming... WEREWOLFS, AWAKEN!`, gameID)
                            }

                            Object.values(game.players).map((player) => { return {...player, votes: 0} })
                        }
                        break

                    case enums.actions.WEREWOLFS:
                        if (role != enums.roles.WEREWOLF) {
                            socket.emit("status-msg", `Your not a werewolf, sily.`, gameID)
                        }
                        if (game.status.time != enums.times.NIGHT) return

                        player.role = enums.roles.DEAD
                        game.status.time = enums.times.DAY
                        game.status.action = enums.actions.VOTE
                        player.socket.emit("status-msg", `The werewolf ${name} has killed you.`, gameID)
                        io.emit("status-msg", `WEREWOLFS, SLEEP! Time spins, turning night to day. In the night, the werewolfs have killed ${playerName}.`, gameID)
                        break
                }
        }
    })

    socket.on("disconnect", () => {
        let gameID = gameConnections[socket.id]
        let game = games[gameID]
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