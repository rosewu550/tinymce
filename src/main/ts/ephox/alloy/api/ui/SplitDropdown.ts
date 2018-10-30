import { Fun, Merger, Option } from '@ephox/katamari';

import { CompositeSketchFactory } from '../../api/ui/UiSketcher';
import * as DropdownUtils from '../../dropdown/DropdownUtils';
import * as AlloyParts from '../../parts/AlloyParts';
import * as ButtonBase from '../../ui/common/ButtonBase';
import * as SplitDropdownSchema from '../../ui/schema/SplitDropdownSchema';
import { SplitDropdownDetail, SplitDropdownSketcher, SplitDropdownSpec } from '../../ui/types/SplitDropdownTypes';
import * as Behaviour from '../behaviour/Behaviour';
import { Composing } from '../behaviour/Composing';
import { Coupling } from '../behaviour/Coupling';
import { Focusing } from '../behaviour/Focusing';
import { Highlighting } from '../behaviour/Highlighting';
import { Keying } from '../behaviour/Keying';
import { Toggling } from '../behaviour/Toggling';
import * as SketchBehaviours from '../component/SketchBehaviours';
import * as AlloyTriggers from '../events/AlloyTriggers';
import * as Sketcher from './Sketcher';

const factory: CompositeSketchFactory<SplitDropdownDetail, SplitDropdownSpec> = (detail, components, spec, externals) => {

  const switchToMenu = (sandbox) => {
    Composing.getCurrent(sandbox).each((current) => {
      Highlighting.highlightFirst(current);
      Keying.focusIn(current);
    });
  };

  const action = (component) => {
    const onOpenSync = switchToMenu;
    DropdownUtils.togglePopup(detail, (x) => x, component, externals, onOpenSync, DropdownUtils.HighlightOnOpen.HighlightFirst).get(Fun.noop);
  };

  const executeOnButton = (comp) => {
    const button = AlloyParts.getPartOrDie(comp, detail, 'button');
    AlloyTriggers.emitExecute(button);
    return Option.some(true);
  };

  const buttonEvents = ButtonBase.events(Option.some(action));

  return {
    uid: detail.uid,
    dom: detail.dom,
    components,
    eventOrder: {
      // Order, the button state is toggled first, so assumed !selected means close.
      'alloy.execute': [ 'toggling', 'alloy.base.behaviour' ]
    },

    events: buttonEvents,

    behaviours: SketchBehaviours.augment(
      detail.splitDropdownBehaviours,
      [
        Coupling.config({
          others: {
            sandbox (hotspot) {
              const arrow = AlloyParts.getPartOrDie(hotspot, detail, 'arrow');
              const extras = {
                onOpen () {
                  Toggling.on(arrow);
                },
                onClose () {
                  Toggling.off(arrow);
                }
              };

              return DropdownUtils.makeSandbox(detail, hotspot, extras);
            }
          }
        }),
        Keying.config({
          mode: 'special',
          onSpace: executeOnButton,
          onEnter: executeOnButton,
          onDown (comp) {
            action(comp);
            return Option.some(true);
          }
        }),
        Focusing.config({ })
      ]
    ),

    domModification: {
      attributes: {
        role: 'presentation'
      }
    }
  };
};

const SplitDropdown = Sketcher.composite({
  name: 'SplitDropdown',
  configFields: SplitDropdownSchema.schema(),
  partFields: SplitDropdownSchema.parts(),
  factory
}) as SplitDropdownSketcher;

export {
  SplitDropdown
};