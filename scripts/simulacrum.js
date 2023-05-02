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
            for (const a of html.querySelectorAll('a.item-name')) {
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

    get parentItems() {
        if (this.type !== 'action') return null;

        const parentItems = [];
        for (const item of this.actor?.items || []) {
            if (item.type === 'action') continue;

            const childrenIDs = item.getFlag(systemID, 'children') || [];
            if (childrenIDs.includes(this.id)) parentItems.push(item);
        }

        return parentItems.length? parentItems : null;
    }

    prepareDerivedData() {
        if (['skill', 'tool'].includes(this.type)) {
            const { baseValue, bonuses } = this.system;
            const value = Number(baseValue) + Number(bonuses);
            if (!!value) this.system.value = value;
        }
    }

    async roll(options = {}) {
        if (this.type !== 'action' || !this.actor) return;

        const { successDie } = this.system;
        const bonusDice = this.getFlag(systemID, 'bonusDice') || 0;
        const formula = `${successDie + bonusDice}d6`;

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

    async _preCreate(data, options, user) {
        if (foundry.utils.hasProperty(this.system, 'equipped')) this.updateSource({'system.equipped': false});

        return super._preCreate(data, options, user);
    }

    async _preUpdate(changed, options, user) {
        if (foundry.utils.hasProperty(changed, 'system.baseDice')) {
            changed.system.baseDice = parseInt(changed.system.baseDice);
        }
        return super._preUpdate(changed, options, user);
    }

    async _onUpdate(changed, options, userID) {
        if (userID === game.user.id) {
            if (changed.system?.equipped === true) await this.equipActions();
            else if (changed.system?.equipped === false) await this.unequipActions();
        }

        return super._onUpdate(changed, options, userID);
    }

    _onDelete(options, userID) {
        if (game.user.id === userID) {
            if (this.actor && this.system.actions?.length) {
                return this.unequipActions();
            }
        }
    }


    async equipActions() {
        debugger
        const createData = [];
        for (const actionUuid of this.system.actions) {
            const item = await getAction(actionUuid);
            if (!item) continue;

            const prexistingAction = this.actor?.items.find(i => {
                const flagUuid = i.getFlag(systemID, 'originalUuid');
                return flagUuid === item.uuid;
            });
            if (prexistingAction) {
                const bonusDice = prexistingAction.getFlag(systemID, 'bonusDice') || 0;
                await prexistingAction.setFlag(systemID, 'bonusDice', bonusDice + 1);
                const children = this.getFlag(systemID, 'children') || [];
                children.push(prexistingAction.id);
                await this.setFlag(systemID, 'children', children); // this is not sticking;
                console.log(this.getFlag(systemID, 'children'))
            } else {
                const itemData = { ...item };
                if (!itemData.flags[systemID]) itemData.flags[systemID] = {};
                itemData.flags[systemID].originalUuid = item.uuid;
                createData.push(itemData);
            }
        }

        if (createData.length) {
            const children = await this.actor.createEmbeddedDocuments('Item', createData);
            const childrenFlag = this.getFlag(systemID, 'children') || [];
            childrenFlag.push(...children.map(c => c.id));
            console.log(childrenFlag)
            return this.setFlag(systemID, 'children', childrenFlag);
        }
    }

    async unequipActions() {
        debugger
        const deleteIDs = [];
        const actionItems = this.getFlag(systemID, 'children')?.map(id => this.actor?.items.get(id));
        if (!actionItems) return;

        for (const actionItem of actionItems) {
            if (!actionItem) continue;

            const bonusDice = actionItem.getFlag(systemID, 'bonusDice') || 0;
            if (bonusDice > 0) {
                await actionItem.setFlag(systemID, 'bonusDice', bonusDice - 1);
            } else deleteIDs.push(actionItem.id);
        }

        if (deleteIDs.length) return this.actor.deleteEmbeddedDocuments('Item', deleteIDs);
    }
 

}

class SimulacrumItemSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            height: 500,
            dragDrop: [{dragSelector: null, dropSelector: null}]
        });
    }

    get template() {
        return `systems/${systemID}/templates/item/item-sheet.hbs`;
    }

    get isEditable() {
        return this.item.parentItems?.length ? false : super.isEditable;
    }

    async getData() {
        const data = super.getData();

        data.notAction = this.item.type !== 'action';

        data.category = this.item.type !== 'skill';
        data.targetStats = {
            resilience: 'Resilience',
            insight: 'Insight',
            sensitivity: 'Sensitivity'
        };

        data.actions = {};
        for (const actionUuid of this.item.system.actions || []) {
            const item = await getAction(actionUuid);
            if (item) data.actions[actionUuid] = item;
        }

        data.hasParentItems = this.item.parentItems?.length > 0;
        data.parentItems = this.item.parentItems?.filter(i => i.system.equipped);
        data.bonusDice = this.item.getFlag(systemID, 'bonusDice');

        lg({data})
        return data;
    }

    activateListeners($html) {
        const [html] = $html;

        const actions = html.querySelectorAll('a.action-name');
        for (const action of actions) {
            action.addEventListener('click', async event => {
                const { currentTarget } = event;
                const li = currentTarget.closest('li.item-action');
                const uuid = li.dataset.itemUuid;                
                const item = await getAction(uuid);
                if (!item?.sheet) return;

                return item.sheet.render(true);
            });
        }

        const parentNames = html.querySelectorAll('a.parent-item-name');
        for (const parentName of parentNames) {
            parentName.addEventListener('click', () => {
                const parentItemID = parentName.dataset.itemId;
                const parentItem = this.actor?.items.get(parentItemID);
                return parentItem?.sheet.render(true);
            });
        }

        super.activateListeners($html);
    }

    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event);
        if (!data.type === 'item') return;

        const item = await getAction(data.uuid);
        if (!item || item.type !== 'action') return;

        const actions = this.item.system.actions;
        if (actions.includes(data.uuid)) return;

        actions.push(data.uuid);

        return this.item.update({'system.actions': actions});
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


async function getAction(uuid) {
    const uuidData = fromUuidSync(uuid);
    let item;
    if (uuidData.pack) {
        const pack = game.packs.get(uuidData.pack);
        item = await pack.getDocument(uuidData._id);
    } else item = uuidData;

    return item;
}