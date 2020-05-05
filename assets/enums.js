const enums = {
    times: {
        END: "end",
        DAY: "day",
        NIGHT: "night",
    },
    actions: {
        NONE: "none",
        VOTE: "vote",
        WEREWOLVES: "werewolves",
        SEER: "seer"
    },
    roles: {
        NOTASSINGED: "none",
        DEAD: "dead",
        WEREWOLF: "werewolf",
        VILLAGER: "villager",
        SEER: "seer"
    }
}

if (typeof module != "undefined") module.exports = enums