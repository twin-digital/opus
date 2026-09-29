-- writes options.mark to global ext state TEST/<options.thing>; its subject is that thing
return {
  run = function(options)
    reaper.SetExtState("TEST", options.thing, options.mark, false)
  end,
  subject = function(options)
    if options.thing == "unnamed" then error("no thing to name") end
    return "thing:" .. options.thing
  end,
}
