import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export const StateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  crossMachinePatternsFound: Annotation({
    default: () => [],
  }),
  digitalTwinContext: Annotation({
    default: () => null,
  }),
});
