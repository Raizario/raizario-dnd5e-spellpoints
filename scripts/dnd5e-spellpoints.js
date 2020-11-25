var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

const MODULE_NAME = 'dnd5e-spellpoints';

Handlebars.registerHelper("spFormat", (path, ...args) => {
  return game.i18n.format(path, args[0].hash);
});

class SpellPoints {
  static get settings() {
    return mergeObject(this.defaultSettings, game.settings.get(MODULE_NAME, 'settings'));
  }
  /**
   * Get default settings object.
   * @returns ChatPortraitSetting
   */
  static get defaultSettings() {
    return {
      spEnableSpellpoints: false,
      spResource: 'Spell Points',
      spAutoSpellpoints: false,
      spFormula: 'DMG',
      spellPointsByLevel: {1:4,2:6,3:14,4:17,5:27,6:32,7:38,8:44,9:57,10:64,11:73,12:73,13:83,14:83,15:94,16:94,17:107,18:114,19:123,20:133},
      spellPointsCosts: {1:2,2:3,3:5,4:6,5:7,6:9,7:10,8:11,9:13},
      spEnableVariant: false,
      spLifeCost: 2
    };
  }
  
  static isModuleActive(){
    return game.settings.get(MODULE_NAME, 'spEnableSpellpoints');
  }
  
  static isActorCharacter(actor){
    return getProperty(actor, "data.type") == "character";
  }
  
  /** check what resource is spellpoints on this actor **/
  static getSpellPointsResource(actor) {
    let _resources = getProperty(actor, "data.data.resources");
    for (let r in _resources) {
      if (_resources[r].label == this.settings.spResource) {
        return {'values'  : _resources[r],'key'     : r};
        break;
      }
    }
    return false;
  }
  
  static castSpell(actor, update) {
      /** do nothing if module is not active **/
    if (!SpellPoints.isModuleActive() || !SpellPoints.isActorCharacter(actor))
      return update;
    
    let spell = getProperty(update, "data.spells");
    if (!spell || spell === undefined)
      return update;
    
    let hp = getProperty(update, "data.attributes.hp.value");
    let spellPointResource = SpellPoints.getSpellPointsResource(actor);

    /** not found any resource for spellpoints ? **/
    if (!spellPointResource) {
      ChatMessage.create({
        content: "<i style='color:red;'>"+actor.data.name+" doesn't have any resource named '"+this.settings.spResource+"'.</i>",
        speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
      });
      ui.notifications.error("Please create a new resource and name it: '"+this.settings.spResource+"'");
      return {};
    }
    
    /** find the spell level just cast */
    const spellLvlNames = ["spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9"];
    let spellLvlIndex = spellLvlNames.findIndex(name => { return getProperty(update, "data.spells." + name) });
    
    let spellLvl = spellLvlIndex + 1;
    //** slot calculation **/
    const origSlots = actor.data.data.spells;
    const preCastSlotCount = getProperty(origSlots, spellLvlNames[spellLvlIndex] + ".value");
    const postCastSlotCount = getProperty(update, "data.spells." + spellLvlNames[spellLvlIndex] + ".value");
    const maxSlots = getProperty(origSlots, spellLvlNames[spellLvlIndex] + ".max");
    
    let slotCost = preCastSlotCount - postCastSlotCount;
    
    /** restore slots to the max **/
    update.data.spells[spellLvlNames[spellLvlIndex]].value = maxSlots;
    
    const maxSpellPoints = actor.data.data.resources[spellPointResource.key].max;
    const actualSpellPoints = actor.data.data.resources[spellPointResource.key].value;
    /* get spell cost in spellpoints */
    console.log(spellPointResource);
    const spellPointCost = this.settings.spellPointsCosts[spellLvl];
    
    /** update spellpoints **/
    if (actualSpellPoints - spellPointCost >= 0 ) {
      /* character has enough spellpoints */
      spellPointResource.values.value = spellPointResource.values.value - spellPointCost;
    } else if (actualSpellPoints - spellPointCost < 0) {
      /** check if actor can cast using HP **/
      if (this.settings.spEnableVariant) {
        // spell point resource is 0 but character can still cast.
        spellPointResource.values.value = 0;
        const hpMaxLost = spellPointCost * SpellPoints.settings.spLifeCost;
        const hpActual = actor.data.data.attributes.hp.value;
        let hpMaxActual = actor.data.data.attributes.hp.tempmax;
        const hpMaxFull = actor.data.data.attributes.hp.max;
        if (!hpMaxActual)
          hpMaxActual = 0;
        const newMaxHP = hpMaxActual - hpMaxLost;
        
        console.log({spellPointCost});
        console.log(SpellPoints.settings.spLifeCost);
        console.log({hpMaxLost});
        console.log({hpActual});
        console.log({hpMaxActual});
        console.log({newMaxHP});
        
        if (hpMaxFull + newMaxHP <= 0) { //character is permanently dead
          // 3 death saves failed and 0 hp 
          update.data.attributes = {'death':{'failure':3}, 'hp':{'tempmax':-hpMaxFull,'value':0}}; 
          ChatMessage.create({
            content: "<i style='color:red;'>"+actor.data.name+" casted using his own life and Died Permanently!</i>",
            speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
          });
        } else {
          update.data.attributes = {'hp':{'tempmax':newMaxHP}};// hp max reduction
          if (hpActual > newMaxHP) { // a character cannot have more hp than his maximum
            update.data.attributes = mergeObject(update.data.attributes,{'hp':{'value': hpMaxFull + newMaxHP}});
          }
          ChatMessage.create({
            content: "<i style='color:red;'>"+actor.data.name+" casted using his own life losing " + hpMaxLost + " HP Maximum.</i>",
            speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
          });
        }
      } else { 
        ChatMessage.create({
          content: "<i style='color:red;'>"+actor.data.name+" doesn't have enough '"+this.settings.spResource+"' to cast this spell.</i>",
          speaker: ChatMessage.getSpeaker({ alias: actor.data.name })
        });
      }
    }
    console.log({update});
    update.data.resources = {
      [spellPointResource.key] : spellPointResource.values
    };
    
    return update;
  }
  
  static checkDialogSpellPoints(dialog, html, formData){
    if (!SpellPoints.isModuleActive())
      return;
  
    /** check if this is a spell **/
    let isSpell = false;
    if ( dialog.item.data.type === "spell" )
      isSpell = true;
    
    const spell = dialog.item.data;
    // spell level can change later if casting it with a greater slot, baseSpellLvl is the default
    const baseSpellLvl = spell.data.level;
    
    if (!isSpell)
      return;
    
    /** check if actor is a player character **/
    let actor = getProperty(dialog, "item.options.actor");
    if(!this.isActorCharacter(actor))
      return;
    
    /** get spellpoints **/
    let spellPointResource = SpellPoints.getSpellPointsResource(actor);
    if (!spellPointResource) {
      // this actor has no spell point resource what to do?
      $('#ability-use-form', html).append('<div class="spError">Please create a resource named: <b>' + this.settings.spResource + '</b> to cast this spell.</div>');
      return;
    }
    const maxSpellPoints = actor.data.data.resources[spellPointResource.key].max;
    const actualSpellPoints = actor.data.data.resources[spellPointResource.key].value;

    let spellPointCost = this.settings.spellPointsCosts[baseSpellLvl];
    
    if (actualSpellPoints - spellPointCost < 0) {
      $('#ability-use-form', html).append('<div class="spError">You have not enough <b>' + this.settings.spResource + '</b> to cast this spell.</div>');
    }

    let copyButton = $('.dialog-button', html).clone();
    $('.dialog-button', html).addClass('original').hide();
    copyButton.addClass('copy');
    $('.dialog-buttons', html).append(copyButton);
    
    html.on('click','.dialog-button.copy', function(e){
      /** if consumeSlot we ignore cost, go on and cast or if variant active **/
      if (!$('input[name="consumeSlot"]',html).prop('checked') 
          || SpellPoints.settings.spEnableVariant) {
        $('.dialog-button.original', html).trigger( "click" );
      } else if ($('select[name="level"]', html).length > 0) {
        let spellLvl = $('select[name="level"]', html).val();
        spellPointCost = SpellPoints.settings.spellPointsCosts[spellLvl];
        if (actualSpellPoints - spellPointCost < 0) {
          ui.notifications.error("You don't have enough: '" + SpellPoints.settings.spResource + "' to cast this spell");
          dialog.close();
        } else {
          $('.dialog-button.original', html).trigger( "click" );
        }
      }
    })
  }
  
  /* params:
  * actor(obj) = dnd5e actor
  * item(obj) = the item being dropped updated
  * action(string) = create/update
  */
  
  static calculateSpellPoints(actor, item, actionString) {
    if (!this.isModuleActive() || !this.isActorCharacter(actor))
      return;
    /* updating or dropping a class item */
    if (getProperty(item, 'type') !== 'class')
      return;
    
    const spellcasting = getProperty(item.data, 'spellcasting');
    const classLevel = getProperty(item.data, 'levels');
    console.log({spellcasting});
    
    const classDroppedName = getProperty(item, 'name');
    
    // check if this is the orignal name or localized with babele
    if (getProperty(item, 'flags.babele.translated')){
      let originalName = getProperty(item, 'flags.babele.originalName');
    } else {
      let originalName = classDroppedName;
    }
    
    console.log(actor);
    //const classItem = actor.items.find(i => i.name === "Ranger");
    const actorClasses = actor.items.filter(i => i.type === "class");
    const classItem = actor.items.getName(classDroppedName);
    console.log('Dropped Class=',classDroppedName);
    console.log('Actor Item=',classItem);
    console.log('actorClasses=',actorClasses);
    
    let spellPointResource = this.getSpellPointsResource(actor);
    
    const actorName = actor.data.name;
    
    if (!spellPointResource) {
      ui.notifications.error("SPELLPOINTS: Cannot find resource '" + this.settings.spResource + "' on " + actorName + " character sheet!");
      return;
    }
    ui.notifications.info("SPELLPOINTS: Found resource '" + this.settings.spResource + "' on " + actorName + " character sheet! Your spellpoint Maximum have been updated.");
    
    let SpellPointsMax = 0;
    
    for (let c of actorClasses){
      console.log(c);
      /* spellcasting: pact; full; half; third; artificier; none; **/
      let spellcasting = c.data.data.spellcasting;
      let level = c.data.data.levels;
      switch(spellcasting) {
        case 'full':
          SpellPointsMax += this.settings.spellPointsByLevel[level];
          break;
        case 'half':
          SpellPointsMax += this.settings.spellPointsByLevel[Math.ceil(level/2)];
          break;
        case 'third':
          SpellPointsMax += this.settings.spellPointsByLevel[Math.ceil(level/3)];
          break;
        default:
          SpellPointsMax += 0;
      }
    }
    if (SpellPointsMax > 0) {
      let updateActor = {[`data.resources.${spellPointResource.key}.max`] : SpellPointsMax}; ;
      actor.update(updateActor);
    }
  }
  
} /** END SpellPoint Class **/


/**
* SPELL POINTS APPLICATION SETTINGS FORM
*/
class SpellPointsForm extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize('dnd5e-spellpoints.form-title'),
      id: 'spellpoints-form',
      template: `modules/${MODULE_NAME}/templates/spellpoint-config.html`,
      width: 500,
      closeOnSubmit: true
    });
  }
  
  getData(options) {
    return mergeObject({
      spFormulas: {
          'DMG': game.i18n.localize('dnd5e-spellpoints.DMG')
          //'AM': game.i18n.localize('dnd5e-spellpoints.AM')
      }
    }, this.reset ? SpellPoints.defaultSettings :
      mergeObject(SpellPoints.defaultSettings, game.settings.get(MODULE_NAME, 'settings')));
  }
  
  onReset() {
    this.reset = true;
    this.render();
  }
  
  _updateObject(event, formData) {
    return __awaiter(this, void 0, void 0, function* () {
      let settings = mergeObject(SpellPoints.settings, formData, { insertKeys: true, insertValues: true });
      yield game.settings.set(MODULE_NAME, 'settings', settings);
    });
  }
  activateListeners(html) {
    super.activateListeners(html); 
    html.find('button[name="reset"]').click(this.onReset.bind(this));
  }
} /** end SpellPointForm **/

Hooks.on('init', () => {
  console.log('SpellPoints init');
  /** should spellpoints be enabled */
  game.settings.register(MODULE_NAME, "spEnableSpellpoints", {
    name: "Enable Spell Points system",
    hint: "Enables or disables spellpoints for casting spells, this will override the slot cost for player tokens.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: spEnableSpellpoints => {
      window.location.reload();
    }
  });
  
  game.settings.registerMenu(MODULE_NAME, MODULE_NAME, {
    name: "dnd5e-spellpoints.form",
    label: "dnd5e-spellpoints.form-title",
    hint: "dnd5e-spellpoints.form-hint",
    icon: "fas fa-magic",
    type: SpellPointsForm,
    restricted: true
  });

  game.settings.register(MODULE_NAME, "settings", {
    name: "Spell Points Settings",
    scope: "world",
    default: SpellPointsForm.defaultSettings,
    type: Object,
    config: false,
    onChange: (x) => window.location.reload()
  });
});

// collate all preUpdateActor hooked functions into a single hook call
Hooks.on("preUpdateActor", async (actor, update, options, userId) => {
  update = SpellPoints.castSpell(actor, update);
});

/** spell launch dialog **/
// renderAbilityUseDialog renderApplication
Hooks.on("renderAbilityUseDialog", async (dialog, html, formData) => {
  SpellPoints.checkDialogSpellPoints(dialog, html, formData);
})

/** attempt to calculate spellpoints on class item drop or class update**/
// const item = actor.items.find(i => i.name === "Items Name");
Hooks.on("updateOwnedItem", async (actor, item, update, diff, userId) => {
  SpellPoints.calculateSpellPoints(actor, item, 'update');
})
Hooks.on("createOwnedItem", async (actor, item, options, userId) => {
  SpellPoints.calculateSpellPoints(actor, item, 'create');
})