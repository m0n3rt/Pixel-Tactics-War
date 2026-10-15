/* ═══════════════════════════════════════════════════════════
   事件系统（run 层）
   - 事件数据 EVENTS 位于 data/events.js（effect 经 eventEnv 访问运行时）
   - 事件屏渲染 / 结果弹窗
   ═══════════════════════════════════════════════════════════ */
import { EVENTS } from '../data/events.js';
import { showMapScreen } from './map.js';

/* ═══════ DOM ═══════ */
const $ = id => document.getElementById(id);
const uiRoot     = $('ui-root');
const eventScreen = $('event-screen');
const eventResultOverlay = $('event-result-overlay');
const eventResultTitle = $('event-result-title');
const eventResultText = $('event-result-text');

export function showEventResultPopup(title, message){
  if(!eventResultOverlay) return;
  if(eventResultTitle) eventResultTitle.textContent = title || '事件结果';
  if(eventResultText) eventResultText.textContent = message || '本次事件没有额外效果。';
  eventResultOverlay.classList.remove('hidden');
}

export function closeEventResultPopup(){
  if(!eventResultOverlay) return;
  eventResultOverlay.classList.add('hidden');
  showMapScreen();
}

export function showEventScreen(){
  uiRoot.classList.add('hidden');
  eventScreen.classList.remove('hidden');
  
  // 随机选择一个事件
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  $('event-title').textContent = event.title;
  $('event-description').textContent = event.desc;
  
  const choicesContainer = $('event-choices');
  choicesContainer.innerHTML = '';
  
  event.choices.forEach(choice => {
    const choiceDiv = document.createElement('div');
    choiceDiv.className = 'event-choice';
    choiceDiv.innerHTML = `<div class="choice-title">${choice.text}</div>`;
    choiceDiv.addEventListener('click', () => {
      const outcome = choice.effect();
      eventScreen.classList.add('hidden');
      if(outcome && outcome.popup){
        showEventResultPopup(outcome.title, outcome.message);
      } else {
        showMapScreen();
      }
    });
    choicesContainer.appendChild(choiceDiv);
  });
}
