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

app.get("/rules", (req, res) => {
    res.sendFile(__dirname + "/rules.html")
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
            votes: 0,
            voted: []
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
            player.socket.emit("player-join", dataRaw.name, dataRaw.gameID)
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
            votes: 0,
            voted: []
        }
        if (games[data.gameID]) {
            socket.emit("join-fail", "Game ID invalid.")
            return
        }
        let game = {
            players: {[data.name]: playerData},
            status: {
                time: enums.times.END,
                action: enums.actions.NONE,
                werewolvesLeft: -1,
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
        if (!games[gameID]) return
        if (games[gameID].players[name].role != enums.roles.DEAD || games[gameID].status.time == enums.times.END) io.emit("msg", msg, name, gameID)
    })

    socket.on("cmd", (msg) => {
        let gameID = gameConnections[socket.id]
        let game = games[gameID]
        if (!game) return
        let isHost = game.players[name].isHost
        let role = game.players[name].role


        let inputs = msg.split(" ")
        let cmd = inputs.shift()
        
        switch (cmd) {
            case "start":
                if (isHost) {
                    io.emit("status-msg", `${name} has started the game. Get ready...`, gameID)

                    let done = []
                    let werewolvesSkipped = 0
                    for (let i = 0; i < 3; i++) {
                        if (Object.keys(game.players).length - done.length > 3) { 
                            let playerIndex = Math.floor(Math.random() * (Object.keys(game.players).length))
                            if (done.indexOf(playerIndex) == -1) {
                                done.push(playerIndex)
                                let player = Object.values(game.players)[playerIndex]
                                player.socket.emit("set-role", enums.roles.WEREWOLF)
                                player.role = enums.roles.WEREWOLF
                            } else {
                                i--
                            }
                        } else {
                            werewolvesSkipped++
                        }
                    }
                    for (let i = 0; i < 1; i++) {
                        let twoThirds = Math.floor(Object.keys(game.players).length / 3) * 2
                        if (Object.keys(game.players).length - done.length > twoThirds) {
                            let playerIndex = Math.floor(Math.random() * (Object.keys(game.players).length))
                            if (done.indexOf(playerIndex) == -1) {
                                done.push(playerIndex)
                                let player = Object.values(game.players)[playerIndex]
                                player.socket.emit("set-role", enums.roles.SEER)
                                player.role = enums.roles.SEER
                            } else {
                                i--
                            }
                        }
                    }

                    Object.values(game.players).forEach((player, i) => {
                        if (done.indexOf(i) == -1) {
                            player.socket.emit("set-role", enums.roles.VILLAGER)
                            player.role = enums.roles.VILLAGER
                        }
                    })

                    game.status.werewolvesLeft = 3 - werewolvesSkipped
                    game.status.playersLeft = Object.keys(game.players).length

                    console.log(game)

                    if (werewolvesSkipped > 0) {
                        socket.emit("status-msg", `There are ${3 - werewolvesSkipped} werewolf(s). This is beacuse of a shortage of players.`, gameConnections[socket.id])
                    }

                    game.status.time = enums.times.DAY
                    game.status.action = enums.actions.VOTE
                }
                break
                
            case "whoami":
                if (game.status.time != enums.times.END) {
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

            case "rules":
                socket.emit("open-url", `/rules`)
                break
            
            case "player":
                let playerName = inputs.join(" ")
                let playerIndex = Object.keys(game.players).indexOf(playerName)
                if (playerIndex == -1 || role == enums.roles.DEAD) return
                let player = Object.values(game.players)[playerIndex]
                if (player.role == enums.roles.DEAD) return
                if (player.name == name) return

                switch (game.status.action) {
                    case enums.actions.VOTE:
                        if (game.status.time != enums.times.DAY) return
                        if (player.voted.indexOf(name) != -1) return
                        if (player.votes == 0) io.emit("status-msg", `${name} accused ${playerName}. To second this, type #player ${playerName}.`, gameID)
                        else io.emit("status-msg", `${name} seconded the vote for ${playerName}.`, gameID)
                        player.votes++
                        player.voted.push(name)
                        if (player.votes > Math.floor(game.status.playersLeft / 2)) {
                            io.emit("status-msg", `There are ${player.votes} votes for ${playerName}. They will be killed.`, gameID)
                            player.socket.emit("status-msg", "You are dead now.", gameID)
                            game.status.playersLeft -= 1
                            game.status.time = enums.times.NIGHT
                            game.status.action = enums.actions.SEER

                            if (player.role == enums.roles.WEREWOLF) game.status.werewolvesLeft -= 1
                            player.role = enums.roles.DEAD

                            if (game.status.werewolvesLeft == 0) {
                                game.status.time = enums.times.END
                                game.status.action = enums.actions.NONE
                                io.emit("win-msg", `The last werewolf, ${playerName}, has been killed. The village is safe at last!`, gameID)
                            } else {
                                io.emit("status-msg", `Day turns to dusk. Night is coming... SEER, AWAKEN!`, gameID)

                                let seerAlive = false
                                Object.values(game.players).forEach(player => {
                                    if (player.role == enums.roles.SEER) seerAlive = true
                                })

                                if (!seerAlive) {
                                    setTimeout(() => {
                                        game.status.action = enums.actions.WEREWOLVES
                                        io.emit("status-msg", `SEER, SLEEP! Dusk becomes darker, until it is night. WEREWOLVES, AWAKEN!`, gameID)
                                    }, 10000);
                                }
                            }
                        }
                        break

                    case enums.actions.WEREWOLVES:
                        if (role != enums.roles.WEREWOLF) {
                            socket.emit("status-msg", `Your not a werewolf, sily. For what reason would you want to be? Go back to bed.`, gameID)
                            return
                        }
                        if (game.status.time != enums.times.NIGHT) return

                        player.votes++
                        
                        let attacks = 0
                        Object.values(game.players).forEach((player) => {
                            if (player.votes > 0) {
                                attacks++
                            }
                        })

                        if (attacks >= game.status.werewolvesLeft) {
                            player.role = enums.roles.DEAD
                            game.status.time = enums.times.DAY
                            game.status.action = enums.actions.VOTE
                            game.status.playersLeft -= 1

                            player.socket.emit("status-msg", `The werewolf, ${name}, has killed you.`, gameID)
                            io.emit("status-msg", `WEREWOLVES, SLEEP. Time spins, turning night to day. In the night, ${playerName}, was killed.`, gameID)
                            if (game.status.playersLeft == game.status.werewolvesLeft * 2) {
                                io.emit("win-msg", `After the villagers died, the werewolves reign over the village, terrorizing all who pass...`, gameID)
                            }
                        } else {
                            game.status.time = enums.times.DAY
                            game.status.action = enums.actions.VOTE

                            io.emit("status-msg", `WEREWOLVES, SLEEP. Time starts to spin, Night becomes Day.`, gameID)
                        }
                        break
                    
                    case enums.actions.SEER:
                        if (role != enums.roles.SEER) {
                            socket.emit("status-msg", `You can see nothing, sily. Go back to bed.`, gameID)
                            return
                        }

                        socket.emit("status-msg", `The player, ${playerName}, is ${player.role == enums.roles.WEREWOLF ? "" : "not "}a werewolf`, gameID)

                        game.status.action = enums.actions.WEREWOLVES
                        io.emit("status-msg", `SEER, SLEEP! Dusk becomes darker, until it is night. WEREWOLVES, AWAKEN!`, gameID)

                        Object.values(game.players).map((player) => { return { ...player, votes: 0, voted: [] } })
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