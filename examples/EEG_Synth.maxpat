{
 "patcher" : {
  "fileversion" : 1,
  "appversion" : {
   "major" : 8,
   "minor" : 1,
   "revision" : 11,
   "architecture" : "x64",
   "modernui" : 1
  },
  "classnamespace" : "box",
  "rect" : [ 100, 100, 1000, 700 ],
  "openrect" : [ 0, 0, 0, 0 ],
  "bglocked" : 0,
  "openinwindow" : 0,
  "showontab" : 1,
  "tabname" : "Muse EEG Synth",
  "statustext" : "",
  "boxanimatetime" : 200,
  "enablehscroll" : 1,
  "enablevscroll" : 1,
  "devicewidth" : 0,
  "description" : "",
  "digest" : "",
  "tags" : "",
  "style" : "",
  "subpatcher_template" : "",
  "assistshader" : "",
  "boxes" : [ 
   {
    "box" : {
     "id" : "obj-1",
     "maxclass" : "message",
     "numinlets" : 2,
     "numoutlets" : 1,
     "outlettype" : [ "" ],
     "patching_rect" : [ 50, 50, 200, 22 ],
     "text" : "OSCRe /muse/eeg 127.0.0.1 7401"
    }
   },
   {
    "box" : {
     "id" : "obj-2",
     "maxclass" : "object",
     "numinlets" : 0,
     "numoutlets" : 4,
     "outlettype" : [ "float", "float", "float", "float" ],
     "patching_rect" : [ 50, 100, 200, 22 ],
     "text" : "OSCInput /muse/eeg",
     "maxclass" : "osexpr"
    }
   },
   {
    "box" : {
     "id" : "obj-3",
     "maxclass" : "number",
     "numinlets" : 1,
     "numoutlets" : 2,
     "outlettype" : [ "", "bang" ],
     "patching_rect" : [ 50, 150, 50, 22 ],
     "text" : "0."
    }
   },
   {
    "box" : {
     "id" : "obj-4",
     "maxclass" : "comment",
     "numinlets" : 1,
     "numoutlets" : 0,
     "patching_rect" : [ 50, 30, 300, 20 ],
     "text" : "Muse EEG Synthesizer (Max/MSP)",
     "fontsize" : 14,
     "fontweight" : 1
    }
   }
  ],
  "lines" : [ 
   {
    "patchline" : {
     "source" : [ "obj-2", 0 ],
     "destination" : [ "obj-3", 0 ],
     "hidden" : 0,
     "midpoints" : [ ]
    }
   }
  ],
  "appversion" : {
   "major" : 8,
   "minor" : 1,
   "revision" : 11,
   "architecture" : "x64",
   "modernui" : 1
  },
  "classnamespace" : "box",
  "userstate" : {
   "key" : "value"
  },
  "default_fontsize" : 12.0,
  "default_fontface" : 0,
  "default_fontname" : "Arial",
  "gridonopen" : 1,
  "gridsize" : [ 15.0, 15.0 ],
  "gridsnaponopen" : 1,
  "toolbarvisible" : 1,
  "boxanimatetime" : 200,
  "imprint" : 0,
  "enablehscroll" : 1,
  "enablevscroll" : 1,
  "devicewidth" : 0.0,
  "description" : "",
  "digest" : "",
  "tags" : "",
  "style" : "",
  "subpatcher_template" : "",
  "boxes" : [
   {
    "box" : {
     "id" : "obj-intro",
     "maxclass" : "comment",
     "numinlets" : 1,
     "numoutlets" : 0,
     "patching_rect" : [ 20, 20, 600, 30 ],
     "text" : "🧠 Muse EEG Synthesizer - Max/MSP\nReceives OSC from Node.js server on port 7401",
     "fontsize" : 16,
     "fontweight" : 1,
     "textcolor" : [ 0.2, 0.8, 0.2, 1.0 ]
    }
   },
   {
    "box" : {
     "id" : "obj-setup",
     "maxclass" : "comment",
     "numinlets" : 1,
     "numoutlets" : 0,
     "patching_rect" : [ 20, 60, 900, 60 ],
     "text" : "SETUP:\n1. Make sure the Node.js server is running (node server-enhanced.js)\n2. Enable Simulator Mode in the web dashboard\n3. This patch will receive /muse/eeg messages on port 7401\n4. Audio will play based on the 4 EEG channels",
     "fontsize" : 11,
     "bgcolor" : [ 0.2, 0.2, 0.2, 1.0 ]
    }
   },
   {
    "box" : {
     "id" : "obj-osc-recv",
     "maxclass" : "comment",
     "numinlets" : 1,
     "numoutlets" : 0,
     "patching_rect" : [ 20, 140, 300, 20 ],
     "text" : "OSC INPUT - Receives /muse/eeg [ch1, ch2, ch3, ch4]",
     "fontsize" : 12,
     "fontweight" : 1
    }
   },
   {
    "box" : {
     "id" : "obj-udpreceive",
     "maxclass" : "udpreceive",
     "numinlets" : 1,
     "numoutlets" : 1,
     "outlettype" : [ "" ],
     "patching_rect" : [ 20, 170, 150, 22 ],
     "port" : 7401
    }
   },
   {
    "box" : {
     "id" : "obj-oscparse",
     "maxclass" : "o.display",
     "numinlets" : 1,
     "numoutlets" : 0,
     "patching_rect" : [ 20, 210, 400, 200 ]
    }
   }
  ],
  "lines" : [
   {
    "patchline" : {
     "source" : [ "obj-udpreceive", 0 ],
     "destination" : [ "obj-oscparse", 0 ],
     "hidden" : 0
    }
   }
  ]
 }
}
