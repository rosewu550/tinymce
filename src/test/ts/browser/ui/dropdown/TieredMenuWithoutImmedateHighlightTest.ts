
import { Assertions, Chain, Keyboard, Keys, Step, ApproxStructure } from '@ephox/agar';
import { UnitTest } from '@ephox/bedrock';
import { Objects } from '@ephox/boulder';
import { Arr, Obj } from '@ephox/katamari';
import * as AddEventsBehaviour from 'ephox/alloy/api/behaviour/AddEventsBehaviour';
import * as Behaviour from 'ephox/alloy/api/behaviour/Behaviour';
import { Keying } from 'ephox/alloy/api/behaviour/Keying';
import * as GuiFactory from 'ephox/alloy/api/component/GuiFactory';
import * as AlloyEvents from 'ephox/alloy/api/events/AlloyEvents';
import * as AlloyTriggers from 'ephox/alloy/api/events/AlloyTriggers';
import * as SystemEvents from 'ephox/alloy/api/events/SystemEvents';
import { Menu } from 'ephox/alloy/api/ui/Menu';
import { tieredMenu as TieredMenu } from 'ephox/alloy/api/ui/TieredMenu';
import * as MenuEvents from 'ephox/alloy/menu/util/MenuEvents';
import * as TestDropdownMenu from 'ephox/alloy/test/dropdown/TestDropdownMenu';
import * as GuiSetup from 'ephox/alloy/test/GuiSetup';
import { Element } from '@ephox/sugar';

UnitTest.asynctest('TieredMenuWithoutImmediateHighlightTest', (success, failure) => {

  GuiSetup.setup((store, doc, body) => {
    return GuiFactory.build(
      TieredMenu.sketch({
        uid: 'uid-test-menu-1',
        dom: {
          tag: 'div',
          classes: [ 'test-menu' ]
        },
        components: [
          Menu.parts().items({ })
        ],

        markers: TestDropdownMenu.markers(),
        highlightImmediately: false,

        data: {
          primary: 'menu-a',
          menus: Obj.map({
            'menu-a': {
              value: 'menu-a',
              items: Arr.map([
                { type: 'item', data: { value: 'a-alpha', text: 'a-Alpha' }},
                { type: 'item', data: { value: 'a-beta', text: 'a-Beta' }},
                { type: 'item', data: { value: 'a-gamma', text: 'a-Gamma' }}
              ], TestDropdownMenu.renderItem)
            },
            'menu-b': {
              value: 'menu-b',
              items: Arr.map([
                { type: 'item', data: { value: 'b-alpha', text: 'b-Alpha' } }
              ], TestDropdownMenu.renderItem)
            }
          }, TestDropdownMenu.renderMenu),
          expansions: {
            'a-beta': 'menu-b'
          }
        },

        tmenuBehaviours: Behaviour.derive([
          AddEventsBehaviour.config('tiered-menu-test', [
            AlloyEvents.run(MenuEvents.focus(), store.adder('menu.events.focus'))
          ])
        ]),

        eventOrder: Objects.wrapAll([
          {
            key: MenuEvents.focus(),
            value: [ 'alloy.base.behaviour', 'tiered-menu-test' ]
          }
        ]),

        onExecute: store.adderH('onExecute'),
        onEscape: store.adderH('onEscape'),
        onOpenMenu: store.adderH('onOpenMenu'),
        onOpenSubmenu: store.adderH('onOpenSubmenu')
      })
    );
  }, (doc, body, gui, component, store) => {
    return [
      Assertions.sAssertStructure(
        'Original structure test',
        ApproxStructure.build((s, str, arr) => {
          return s.element('div', {
            classes: [ arr.has('test-menu') ],
            children: [
              s.element('ol', {
                classes: [ arr.has('menu'), arr.not('selected-menu') ],
                children: [
                  s.element('li', {
                    classes: [ arr.has('item'), arr.not('selected-item') ]
                  }),
                  s.element('li', {
                    classes: [ arr.has('item'), arr.not('selected-item') ]
                  }),
                  s.element('li', {
                    classes: [ arr.has('item'), arr.not('selected-item') ]
                  })
                ]
              })
            ]
          })
        }),
        component.element()
      ),


      store.sAssertEq('Focus is fired as soon as the tiered menu is active', [
        'onOpenMenu'
      ]),

      Step.sync(() => {
        TieredMenu.highlightPrimary(component);
      }),
      store.sAssertEq('Focus is fired as soon as the tiered menu is highlighted by API', [
        'onOpenMenu',
        'menu.events.focus',
      ]),

      Assertions.sAssertStructure(
        'Checking after TieredMenu.highlightPrimary, menu is active (item and menu selected)',
        ApproxStructure.build((s, str, arr) => {
          return s.element('div', {
            classes: [ arr.has('test-menu') ],
            children: [
              s.element('ol', {
                classes: [ arr.has('menu'), arr.has('selected-menu') ],
                children: [
                  s.element('li', {
                    classes: [ arr.has('item'), arr.has('selected-item') ]
                  }),
                  s.element('li', {
                    classes: [ arr.has('item'), arr.not('selected-item') ]
                  }),
                  s.element('li', {
                    classes: [ arr.has('item'), arr.not('selected-item') ]
                  })
                ]
              })
            ]
          })
        }),
        component.element()
      )
    ];
  }, () => { success(); }, failure);
});
