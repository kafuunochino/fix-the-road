// Platform-neutral reward gate. Live is deliberately disabled unless explicitly
// enabled with a real unit and verified no-share fallback configuration.
export function createRewardedService({mode='disabled',api=null,adUnitId='',shareFallbackDisabled=false,timers={}}={}) {
  const setTimer=timers.setTimeout||(typeof globalThis.setTimeout==='function'?globalThis.setTimeout.bind(globalThis):()=>null),clearTimer=timers.clearTimeout||(typeof globalThis.clearTimeout==='function'?globalThis.clearTimeout.bind(globalThis):()=>{});
  let active=null,serial=0,destroyed=false,retiring=false,retireFailed=false;
  const liveReady=mode==='live'&&api&&typeof api.createRewardedVideoAd==='function'&&typeof adUnitId==='string'&&adUnitId.trim().length>0&&!/placeholder|YOUR_|test|mock|xxxx/i.test(adUnitId)&&shareFallbackDisabled===true;
  const actualMode=mode==='mock'?'mock':liveReady?'live':'disabled';
  function finish(session,status) {
    if(!session||session.done||active!==session)return;
    session.done=true;active=null;clearTimer(session.timer);
    if(session.ad){
      try{session.ad.offClose?.(session.close);}catch{}
      try{session.ad.offError?.(session.error);}catch{}
      retiring=true;
      try{Promise.resolve(session.ad.destroy?.()).catch(()=>{retireFailed=true;}).finally(()=>{retiring=false;});}catch{retiring=false;retireFailed=true;}
    }
    session.resolve({status,requestId:session.id});
  }
  return {
    getState:()=>({mode:actualMode,available:!destroyed&&actualMode!=='disabled'&&!retiring&&!retireFailed,busy:!!active,retiring,retireFailed}),
    request({placement='revive',context=null}={}) {
      const id=`road-reward-${++serial}`;
      if(destroyed||active||retiring||retireFailed||actualMode==='disabled')return Promise.resolve({status:'unavailable',requestId:id});
      return new Promise(resolve=>{
        const session={id,placement,context,resolve,done:false,ad:null,timer:null};active=session;
        session.timer=setTimer(()=>finish(session,'error'),90000);
        if(actualMode==='mock')return;
        try{
          session.ad=api.createRewardedVideoAd({adUnitId,multiton:false});
          if(!session.ad||typeof session.ad.onClose!=='function'||typeof session.ad.onError!=='function'||typeof session.ad.show!=='function'||typeof session.ad.destroy!=='function'){finish(session,'unavailable');return;}
          session.close=res=>{
            const complete=res?.isEnded===true&&(res.count===undefined||(Number.isFinite(res.count)&&res.count>=1));
            finish(session,complete?'completed':'cancelled');
          };
          session.error=err=>finish(session,Number(err?.errCode??err?.errNo)===1004?'unavailable':'error');
          session.ad.onClose(session.close);session.ad.onError(session.error);
          Promise.resolve(session.ad.show()).catch(session.error);
        }catch{finish(session,'error');}
      });
    },
    resolveMock(status){if(actualMode==='mock'&&['completed','cancelled','unavailable','error'].includes(status))finish(active,status);},
    cancel(){finish(active,'cancelled');},
    destroy(){destroyed=true;finish(active,'cancelled');}
  };
}
