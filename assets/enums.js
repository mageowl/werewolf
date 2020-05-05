const enums = {
    times: {
        WAIT: "wait",
        DAY: "day",
        NIGHT: "night",
        WEREWOLFS_WON: "werewolfs-won",
        VILLAGERS_WON: "villagers-won"
    },
    actions: {
        NONE: "none",
        VOTE: "vote",
        WEREWOLFS: "werewolfs"
    },
    roles: {
        NOTASSINGED: "none",
        DEAD: "dead",
        WEREWOLF: "werewolf",
        VILLAGER: "villager"
    }
}

if (typeof module != "undefined") module.exports = enums