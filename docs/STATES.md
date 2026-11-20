# Visual reference

`states.png` shows the three states this plugin can be in. It is an
illustration, not a screenshot: the geometry and colours are transcribed from
`client.js` and the shipped composer CSS, but it was drawn offline, so treat it
as a description of the behaviour rather than as pixel evidence.

Regenerate it (needs Pillow and a Windows CJK font):

```sh
python tools/render-states.py
```

| State | What the picture shows |
| --- | --- |
| Empty draft | Nothing is rendered — no reading, no reserved height. |
| Typing | One line appears under the composer with the live character and token reading. |
| Panel open | Clicking the reading opens a measurement panel anchored above it. |

`preview.svg` is a separate 640×300 asset: it is the single image the plugin
page displays, so it has to be resolution independent and self-contained.
