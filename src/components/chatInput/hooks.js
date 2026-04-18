"use client";
import { useState, useEffect } from "react";
import { streamAgentEvents } from "@/lib/stream/agent";

export function useAgentOptions() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchOptions() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/agent/options");
        const data = await res.json();
        setOptions(data.options || []);
      } catch (e) {
        setError("Failed to load agent options");
      } finally {
        setLoading(false);
      }
    }
    fetchOptions();
  }, []);

  return { options, loading, error };
}

export function useChatInput({
  agentId: initialAgentId,
  setAgentId: setAgentIdProp,
}) {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [agentId, setAgentId] = useState(initialAgentId || "test");

  useEffect(() => {
    setAgentId(initialAgentId || "test");
  }, [initialAgentId]);

  const abortControllerRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResponse("");
    setLogs((prev) => [...prev, { type: "user", values: { content: input } }]);

    abortControllerRef.current = new AbortController();

    try {
      await sendChatMessage({
        message: input,
        agentId,
        threadId,
        setLogs,
        setThreadId,
        setError,
        signal: abortControllerRef.current.signal,
      });
      // The final LLM response is extracted dynamically from the last log inside the hook
    } catch (e) {
      if (e.message !== "Polling aborted manually") {
        setError("Failed to send message: " + e.message);
      }
    } finally {
      setLoading(false);
      setInput(""); 
    }
  };

  const resetConversation = () => {
    setThreadId(null);
    setResponse("");
    setLogs([]);
    setInput("");
    setError(null);
  };

  const handleAgentChange = (id) => {
    setAgentId(id);
    resetConversation();
    if (setAgentIdProp) setAgentIdProp(id);
  };

  return {
    input,
    setInput,
    response,
    logs, // expose logs
    loading,
    error,
    sendMessage,
    threadId,
    resetConversation,
    agentId,
    setAgentId: handleAgentChange,
  };
}

export function useMergedChatInput({
  agentId: initialAgentId,
  setAgentId: setAgentIdProp,
}) {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [agentId, setAgentId] = useState(initialAgentId || "test");
  const { options: agentOptions, loading: loadingAgents } = useAgentOptions();

  useEffect(() => {
    setAgentId(initialAgentId || "test");
  }, [initialAgentId]);

  const abortControllerRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setResponse("");

    abortControllerRef.current = new AbortController();

    try {
      await sendChatMessage({
        message: input,
        agentId,
        threadId,
        setLogs: (updater) => {
          // useMergedChatInput doesn't expose logs directly in the return but we catch the final response
          const next = typeof updater === "function" ? updater([]) : updater;
          next.forEach(evt => {
             if (evt.type === "final") {
               setResponse(evt.values?.content || "");
             }
          });
        },
        setThreadId,
        setError,
        signal: abortControllerRef.current.signal,
      });
    } catch (e) {
      if (e.message !== "Polling aborted manually") {
        setError("Failed to send message: " + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAgentChange = (id) => {
    setAgentId(id);
    setThreadId(null);
    setResponse("");
    setInput("");
    setError(null);
    if (setAgentIdProp) setAgentIdProp(id);
  };

  return {
    input,
    setInput,
    response,
    loading: loading || loadingAgents,
    error,
    sendMessage,
    threadId,
    agentOptions,
    selectedAgentId: agentId,
    handleAgentChange,
  };
}

export function useAgentGraph(agentId) {
  const [imageUrl, setImageUrl] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);

  useEffect(() => {
    if (!agentId) {
      setImageUrl(null);
      setGraphError(null);
      return;
    }
    setGraphLoading(true);
    setGraphError(null);
    setImageUrl(null);
    fetch("/api/agent/visualize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load graph image");
        }
        const blob = await res.blob();
        setImageUrl(URL.createObjectURL(blob));
      })
      .catch((e) => setGraphError(e.message))
      .finally(() => setGraphLoading(false));
  }, [agentId]);

  return { imageUrl, graphLoading, graphError };
}
