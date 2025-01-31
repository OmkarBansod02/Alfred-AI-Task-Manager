import { Mastra } from "@mastra/core";
import {TodoAgent }from "./agents/index.js";
 
const mastra = new Mastra({
  agents: { TodoAgent },
});

export default mastra;