const systemID = 'simulacrum';


const lg = x => console.log(x);



class SimulacrumActor extends Actor {

    prepareDerivedData() {
        if (this.type === 'node') {
            const { resilience, insight } = this.system.attributes;
            const sensitivity = (resilience + insight) / 2;

            this.system.attributes.sensitivity = sensitivity;
        }
    }

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        const prototypeToken = {};
        if (this.type === 'player') Object.assign(prototypeToken, {
            actorLink: true
        });
        this.updateSource({ prototypeToken });
    }

    async _preUpdate(changed, options, user) {
        if (foundry.utils.hasProperty(changed, 'system.attributes.control')) {
            changed.system.attributes.control = Math.clamped(change.system.attributes.control, 0, 10);
        }
        return super._preUpdate(changed, options, user);
    }

}

class SimulacrumActorSheet extends ActorSheet {

    get template() {
        return `systems/${systemID}/templates/actor/actor-sheet.hbs`
    }

    getData(options) {
        const data = super.getData(options);

        lg({ data })

        const Skills = data.actor.items.filter(i => i.type === 'skill');
        const Tools = data.actor.items.filter(i => i.type === 'tool');
        const Actions = data.actor.items.filter(i => i.type === 'action');

        data.items = {
            Skills,
            Tools,
            Actions
        };
        
        data.CONFIG = CONFIG.SIMULACRUM;

        return data;
    }

    activateListeners($html) {
        const [html] = $html;

        for (const a of html.querySelectorAll('a.item-delete')) {
            a.addEventListener('click', event => {
                event.preventDefault();

                const li = event.currentTarget.closest('li.actor-item');
                const item = this.actor.items.get(li.dataset.itemId);
                if (!item) return;

                return item.deleteDialog();
            });
        };

        if (this.actor.isOwner) {
            for (const a of html.querySelectorAll('a.item-edit')) {
                a.addEventListener('click', event => {
                    event.preventDefault();

                    const li = event.currentTarget.closest('li.actor-item');
                    const item = this.actor.items.get(li.dataset.itemId);
                    if (!item) return;

                    return item.sheet.render(true);
                });
            }

            for (const a of html.querySelectorAll('a.item-roll')) {
                a.addEventListener('click', event => {
                    event.preventDefault();

                    const li = event.currentTarget.closest('li.actor-item');
                    const item = this.actor.items.get(li.dataset.itemId);
                    if (!item) return;

                    return item.displayCard();
                });
            }
        }

        super.activateListeners($html);
    }
}

class SimulacrumItem extends Item {

    async roll(options = {}) {
        if (this.type !== 'action' || !this.actor) return;

        const { baseDice } = this.system;
        const formula = `${baseDice}d6`;

        const r = new Roll(formula);

        const messageData = {
            speaker: ChatMessage.getSpeaker({actor: this.actor}),
            flavor: this.name
        };

        return r.toMessage(messageData);
    }

    async displayCard(options = {}) {
        const actor = this.actor;
        if (!actor) return;

        const templateData = {
            actor,
            item: this
        }
        // const template = this.type === 'action' ? `systems/${systemID}/templates/chat/action-chat.hbs` : `systems/${systemID}/templates/chat/skillTool-chat.hbs`;
        const template = `systems/${systemID}/templates/chat/item-chat.hbs`
        const content = await renderTemplate(template, templateData);

        const chatData = {
            user: game.user.id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flags: { "core.canPopout": true }
        };

        ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));

        return ChatMessage.create(chatData);
    }

    async _preUpdate(changed, options, user) {
        if (foundry.utils.hasProperty(changed, 'system.baseDice')) {
            changed.system.baseDice = parseInt(changed.system.baseDice);
        }
        return super._preUpdate(changed, options, user);
    }

}

class SimulacrumItemSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            height: 400
        });
    }

    get template() {
        return `systems/${systemID}/templates/item/item-sheet.hbs`;
    }

    getData() {
        const data = super.getData();

        data.category = this.item.type !== 'skill';
        data.targetStats = {
            resilience: 'Resilience',
            insight: 'Insight',
            sensitivity: 'Sensitivity'
        };

        return data;
    }

}


Hooks.once('init', () => {
    CONFIG.SIMULACRUM = {};
    CONFIG.SIMULACRUM.nodeTypes = {
        desktop: 'Desktop',
        server: 'Server',
        domain: 'Domain Controller',
        hypervisor: 'Hypervisor',
        networking: 'Networking',
        firewall: 'Firewall',
        ids: 'IDS/IPS',
        service: 'Service',
        storage: 'Storage',
        application: 'Application',
        cStorage: 'Cloud Storage',
        cService: 'Cloud Service',
        cSystem: 'Cloud System'
    };

    CONFIG.Actor.documentClass = SimulacrumActor;
    CONFIG.Item.documentClass = SimulacrumItem;

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet(systemID, SimulacrumActorSheet, {
        types: ['player', 'node'],
        makeDefault: true
    });

    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet(systemID, SimulacrumItemSheet, {
        types: ['skill', 'tool', 'action'],
        makeDefault: true
    });
});

Hooks.on('renderChatLog', (app, [html], data) => {
    html.addEventListener('click', event => {
        const { target } = event;

        if (target.tagName === 'BUTTON') {
            event.preventDefault();

            const chatCard = event.target.closest('div.chat-card');
            const { actorId, itemId } = chatCard.dataset;
            const actor = game.actors.get(actorId);
            const item = actor?.items.get(itemId);
            return item?.roll();
        }
    });
});