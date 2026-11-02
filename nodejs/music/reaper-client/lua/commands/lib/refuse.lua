-- Fails a command with its own error code, which the watcher passes to the client.
return function(code, message, details)
  error({ code = code, message = message, details = details }, 0)
end
