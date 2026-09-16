(function () {
  'use strict';
  var currentUser=null, active=false, callbacks, checking=false;
  var el=function(id){return document.getElementById(id);};
  function message(text){el('account-message').textContent=text;}
  function signedIn(user){
    currentUser=user;active=true;el('account-email-label').textContent=user.email;el('account-bar').hidden=false;
    el('account-password').value='';el('pw').value='';
    try{sessionStorage.removeItem('gpmc');}catch(_){}
    callbacks.onAccount();
  }
  function signedOut(text){
    currentUser=null;active=false;el('account-bar').hidden=true;callbacks.onSignedOut();message(text || '');
  }
  async function request(body){
    var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},12000);
    try {
    var response=await fetch('/api/auth',{method:body?'POST':'GET',signal:controller.signal,credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    var result=await response.json();if(!response.ok)throw new Error(result.error || 'Sign-in is temporarily unavailable.');return result;
    } finally {clearTimeout(timer);}
  }
  async function check(initial){
    if(checking)return;checking=true;
    try{
      var result=await request();message('');
      if(result.mode==='legacy'){
        if(active){location.reload();return;}
        el('account-form').hidden=true;el('lockForm').hidden=false;el('account-description').textContent='Use the club access code to open the research workspace.';
        if(initial)callbacks.onLegacy();return;
      }
      if(result.mode!=='accounts')throw new Error('Sign-in is temporarily unavailable.');
      el('lockForm').hidden=true;el('account-form').hidden=false;el('account-description').textContent='Sign in with your approved member account.';
      try{sessionStorage.removeItem('gpmc');}catch(_){}
      if(result.user){if(!active)signedIn(result.user);else if(result.user.id!==currentUser.id)location.reload();}
      else if(active){location.reload();}
      else signedOut('');
    }catch(_){if(initial)message('Account sign-in is unavailable right now. Please try again shortly.');}
    finally{checking=false;}
  }
  window.ResearchAuth={
    storageKey:function(key){return currentUser ? key+':user:'+currentUser.id : key;},
    start:function(config){
      callbacks=config;
      el('account-form').addEventListener('submit',async function(e){
        e.preventDefault();el('account-submit').disabled=true;message('Signing in…');
        try{var result=await request({action:'login',email:el('account-email').value,password:el('account-password').value});signedIn(result.user);message('');}
        catch(err){message(err.message);el('account-password').value='';}
        finally{el('account-submit').disabled=false;}
      });
      el('account-logout').addEventListener('click',async function(){
        el('account-logout').disabled=true;
        try{await request({action:'logout'});location.reload();}
        catch(_){el('account-session-status').textContent='Could not reach the server to sign out. Please retry.';el('account-logout').disabled=false;}
      });
      el('account-retry').addEventListener('click',function(){message('Checking sign-in…');check(true);});
      document.addEventListener('visibilitychange',function(){if(active && !document.hidden)check(false);});
      setInterval(function(){if(active && !document.hidden)check(false);},60000);
      return check(true);
    }
  };
})();
