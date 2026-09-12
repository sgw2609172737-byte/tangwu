'use strict';
// 与本地版共用引擎，在 Worker 中搜索，不阻塞页面输入和动画。
self.window = self;
importScripts('../skills.js', '../engine.js', '../ai.js');
self.onmessage = (event) => {
  const { game, actor, difficulty, budget } = event.data;
  try {
    const g = self.__TW_engine.deserializeGame(game);
    const action = self.__TWAI.chooseAction(g, actor, difficulty, budget);
    self.postMessage({ action });
  } catch (error) { self.postMessage({ error: error.message }); }
};
