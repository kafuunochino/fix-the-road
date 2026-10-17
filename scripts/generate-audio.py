"""Deterministic original low-volume cues; no recordings or third-party samples."""
from pathlib import Path
import math, wave, struct, random
out=Path(__file__).resolve().parents[1]/'assets';out.mkdir(exist_ok=True)
rate=22050
cues={'turn':(.14,[440,660]),'switch':(.22,[350,700]),'send':(.42,[130,180,240]),'win':(.66,[523.25,659.25,783.99,1046.5]),'error':(.32,[220,146.8])}
for name,(duration,notes) in cues.items():
 rng=random.Random(name);samples=[]
 for i in range(int(duration*rate)):
  t=i/rate;part=t/duration*len(notes);f=notes[min(int(part),len(notes)-1)];envelope=min(1,t/.008)*min(1,(duration-t)/.07)
  tone=math.sin(2*math.pi*f*t)*.65+math.sin(2*math.pi*f*2*t)*.15
  if name in ('turn','switch'):tone+=rng.uniform(-1,1)*.12*math.exp(-t*35)
  samples.append(struct.pack('<h',int(7000*tone*envelope)))
 with wave.open(str(out/(name+'.wav')),'wb') as w:w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(b''.join(samples))
