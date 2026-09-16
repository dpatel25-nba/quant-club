"""Account UI flows with mocked sessions and synthetic credentials; no live auth calls."""
import functools
import http.server
import json
import pathlib
import tempfile
import threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
state={'user':None,'failed':False,'outage':False}
calls=[]

def api(route):
    path=urlparse(route.request.url).path
    calls.append(path)
    if path=='/api/auth':
        if state['outage']:
            route.fulfill(status=503,json={'error':'Sign-in is temporarily unavailable.'});return
        if route.request.method=='GET':
            route.fulfill(json={'mode':'accounts','user':state['user']});return
        body=route.request.post_data_json
        if body['action']=='logout':
            state['user']=None;route.fulfill(json={'signedOut':True});return
        if state['failed']:
            route.fulfill(status=401,json={'error':'Unable to sign in. Check your credentials and membership access.'});return
        assert body['password']=='synthetic-ui-password'
        state['user']={'id':'member-one','email':'member@example.test'}
        route.fulfill(json={'user':state['user'],'expiresIn':3600});return
    assert state['user'], 'Data request before sign-in'
    assert route.request.headers.get('x-tools-password')=='__session__', 'Expected session marker, never a password'
    route.fulfill(status=503,json={'error':'Synthetic data response'})

try:
    with sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1280,'height':950})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route(base+'/api/**',api)
        page.goto(base+'/#fundamentals')
        expect(page.locator('#account-form')).to_be_visible()
        expect(page.locator('#lockForm')).to_be_hidden()
        expect(page.locator('#toolsWrap')).to_be_hidden()
        assert calls==['/api/auth'], 'Only session status can load before sign-in'
        state['failed']=True
        page.locator('#account-email').fill('member@example.test')
        page.locator('#account-password').fill('synthetic-ui-password')
        page.locator('#account-submit').click()
        expect(page.locator('#account-message')).to_contain_text('Unable to sign in')
        expect(page.locator('#account-password')).to_have_value('')
        expect(page.locator('#toolsWrap')).to_be_hidden()
        state['failed']=False
        page.locator('#account-password').fill('synthetic-ui-password')
        page.locator('#account-submit').click()
        expect(page.locator('#account-bar')).to_be_visible()
        expect(page.locator('#v-fundamentals')).to_be_visible()
        expect(page.locator('#account-email-label')).to_have_text('member@example.test')
        assert page.evaluate('sessionStorage.getItem("gpmc")') is None
        assert page.evaluate('ResearchAuth.storageKey("draft")')=='draft:user:member-one'
        # Reload restores the server session without entering credentials again.
        page.reload();expect(page.locator('#account-bar')).to_be_visible()
        # A provider outage cannot pretend that sign-out succeeded.
        state['outage']=True;page.locator('#account-logout').click()
        expect(page.locator('#account-session-status')).to_contain_text('Please retry')
        state['outage']=False;page.locator('#account-logout').click()
        expect(page.locator('#account-form')).to_be_visible()
        expect(page.locator('#toolsWrap')).to_be_hidden()
        assert page.evaluate('ResearchAuth.storageKey("draft")')=='draft'
        # Identity switching reloads in-memory state and uses a different storage namespace.
        state['user']={'id':'member-two','email':'second@example.test'}
        page.locator('#account-retry').click()
        expect(page.locator('#account-email-label')).to_have_text('second@example.test')
        assert page.evaluate('ResearchAuth.storageKey("draft")')=='draft:user:member-two'
        state['user']=None
        page.evaluate('document.dispatchEvent(new Event("visibilitychange"))')
        expect(page.locator('#account-form')).to_be_visible()
        expect(page.locator('#toolsWrap')).to_be_hidden()
        # No auth outage reveals the old shared-password form in account mode.
        state['outage']=True;page.reload()
        expect(page.locator('#account-message')).to_contain_text('unavailable')
        expect(page.locator('#lockForm')).to_be_hidden()
        state['outage']=False;page.locator('#account-retry').click()
        expect(page.locator('#account-form')).to_be_visible()
        expect(page.locator('#account-message')).to_have_text('')
        screenshots=pathlib.Path(tempfile.mkdtemp(prefix='gpmc-auth-'))
        for width in (1280,390):
            page.set_viewport_size({'width':width,'height':950})
            for theme in ('light','dark'):
                page.evaluate('(t)=>document.documentElement.setAttribute("data-theme",t)',theme)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Horizontal overflow'
                page.screenshot(path=str(screenshots/f'login-{width}-{theme}.png'),full_page=True)
        assert not errors,errors
        browser.close()
        print('PASS: account login errors, session restore, logout failure/retry, expiry, member separation and mobile/light/dark layouts')
        print('Screenshots:',screenshots)
finally:
    server.shutdown()
