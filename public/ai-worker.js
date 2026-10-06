'use strict';
// 与本地版共用引擎，在 Worker 中搜索，不阻塞页面输入和动画。
self.window = self;
importScripts('../skills.js', '../engine.js', '../ai.js');
self.onmessage = (event) => {
  const { id, game, actor, difficulty, budget } = event.data;
  try {
    const g = self.__TW_engine.deserializeGame(game);
    if(['expert','learned'].includes(difficulty) && !self.__TWLearning) importScripts('../learning.js','../neural-model.js');
    const action = self.__TWAI.chooseAction(g, actor, difficulty, budget);
    self.postMessage({ id,action });
  } catch (error) { self.postMessage({ id,error: error.message }); }
};
