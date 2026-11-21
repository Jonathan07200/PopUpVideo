let activeTab = null;

document.addEventListener('DOMContentLoaded', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tabs[0];

    document.getElementById('rescanButton').addEventListener('click', scanAndRender);

    await scanAndRender();
});

// Injected into the page - must be fully self-contained (no closures over popup.js state).
function scanVideosInPage() {
    return Array.from(document.querySelectorAll('video')).map((video, index) => {
        if (!video.dataset.vgId) {
            video.dataset.vgId = `vg-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        }
        return {
            id: video.dataset.vgId,
            width: video.videoWidth || null,
            height: video.videoHeight || null,
            duration: Number.isFinite(video.duration) ? video.duration : null,
            paused: video.paused,
            volume: video.muted ? 0 : video.volume,
            isPiP: document.pictureInPictureElement === video,
            pipAvailable: !!document.pictureInPictureEnabled && !video.disablePictureInPicture,
            pageTitle: document.title
        };
    });
}

// Injected into the page in direct response to a popup button click, so it still carries the
// user gesture that requestPictureInPicture()/exitPictureInPicture() require.
function togglePiPInPage(id) {
    const video = document.querySelector(`video[data-vg-id="${CSS.escape(id)}"]`);
    if (!video) {
        return Promise.resolve({ ok: false, error: 'Video not found - the page may have changed.' });
    }
    if (document.pictureInPictureElement === video) {
        return document.exitPictureInPicture()
            .then(() => ({ ok: true }))
            .catch((error) => ({ ok: false, error: error.message }));
    }

    // Some sites (Instagram's Reels player included) pause video themselves when the tab is
    // backgrounded, driven by things like scroll-based IntersectionObserver state rather than a
    // simple visibility flag - too varied to reliably prevent. Instead, fight the outcome: while
    // this video is in PiP, immediately resume it if the site pauses it while the tab is hidden.
    if (!video._vgResumeHandler) {
        video._vgResumeHandler = () => {
            if (document.pictureInPictureElement === video && document.hidden) {
                video.play().catch(() => {});
            }
        };
        video.addEventListener('pause', video._vgResumeHandler);
    }

    // Some custom players (also Instagram) re-assert their own volume/muted state on their next
    // render, silently overwriting a one-off change from outside. Keep reapplying the chosen
    // volume instead of setting it once.
    if (video._vgDesiredVolume === undefined) {
        video._vgDesiredVolume = video.muted ? 0 : video.volume;
    }
    if (!video._vgVolumeInterval) {
        video._vgVolumeInterval = setInterval(() => {
            if (document.pictureInPictureElement !== video) return;
            const desired = video._vgDesiredVolume;
            if (video.volume !== desired) video.volume = desired;
            const shouldBeMuted = desired === 0;
            if (video.muted !== shouldBeMuted) video.muted = shouldBeMuted;
        }, 300);
    }

    return video.requestPictureInPicture()
        .then(() => {
            video.addEventListener('leavepictureinpicture', () => {
                video.removeEventListener('pause', video._vgResumeHandler);
                video._vgResumeHandler = null;
                clearInterval(video._vgVolumeInterval);
                video._vgVolumeInterval = null;
            }, { once: true });
            return { ok: true };
        })
        .catch((error) => ({ ok: false, error: error.message }));
}

// Injected on volume slider changes.
function setVolumeInPage(id, volumePercent) {
    const video = document.querySelector(`video[data-vg-id="${CSS.escape(id)}"]`);
    if (!video) {
        return { ok: false, error: 'Video not found - the page may have changed.' };
    }
    const volume = Math.min(1, Math.max(0, volumePercent / 100));
    video._vgDesiredVolume = volume;
    video.volume = volume;
    video.muted = volume === 0;
    return { ok: true };
}

async function scanAndRender() {
    if (!activeTab) return;

    let frameResults = [];
    try {
        frameResults = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: true },
            func: scanVideosInPage
        });
    } catch (error) {
        renderError(error.message);
        return;
    }

    const videos = [];
    for (const frameResult of frameResults) {
        for (const video of frameResult.result || []) {
            videos.push({ ...video, frameId: frameResult.frameId });
        }
    }
    render(videos);
}

function formatMeta(video) {
    const parts = [];
    if (video.width && video.height) parts.push(`${video.width}x${video.height}`);
    if (video.duration) parts.push(`${Math.round(video.duration)}s`);
    parts.push(video.paused ? 'paused' : 'playing');
    return parts.join(' · ');
}

function renderError(message) {
    const empty = document.getElementById('empty');
    empty.style.display = 'block';
    empty.textContent = `Can't scan this page: ${message}`;
    document.getElementById('list').innerHTML = '';
}

function render(videos) {
    const list = document.getElementById('list');
    const empty = document.getElementById('empty');
    list.innerHTML = '';

    if (videos.length === 0) {
        empty.style.display = 'block';
        empty.textContent = 'No videos detected on this page yet.';
        return;
    }
    empty.style.display = 'none';

    videos.forEach((video) => list.appendChild(buildItem(video)));
}

function buildItem(video) {
    const item = document.createElement('div');
    item.className = 'item';

    const top = document.createElement('div');
    top.className = 'item-top';

    const badge = document.createElement('span');
    badge.className = `badge ${video.isPiP ? 'pip' : 'video'}`;
    badge.textContent = video.isPiP ? 'in PiP' : 'video';
    top.appendChild(badge);

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = formatMeta(video);
    top.appendChild(meta);

    item.appendChild(top);

    const title = document.createElement('div');
    title.className = 'url';
    title.textContent = video.pageTitle || '';
    item.appendChild(title);

    const volumeRow = document.createElement('div');
    volumeRow.className = 'volume-row';

    const volumeIcon = document.createElement('span');
    volumeIcon.className = 'volume-icon';
    volumeIcon.textContent = '\u{1F50A}';
    volumeRow.appendChild(volumeIcon);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round((video.volume ?? 1) * 100));
    slider.className = 'volume-slider';
    let debounceHandle = null;
    slider.addEventListener('input', () => {
        clearTimeout(debounceHandle);
        const value = slider.value;
        debounceHandle = setTimeout(() => handleVolumeChange(video, Number(value)), 80);
    });
    volumeRow.appendChild(slider);

    item.appendChild(volumeRow);

    const button = document.createElement('button');
    button.className = 'btn';
    const status = document.createElement('div');
    status.className = 'status-msg';

    if (!video.pipAvailable && !video.isPiP) {
        button.textContent = 'Picture-in-Picture unavailable';
        button.disabled = true;
    } else {
        button.textContent = video.isPiP ? 'Exit Picture-in-Picture' : 'Pop into Picture-in-Picture';
        button.addEventListener('click', () => handleToggle(video, button, status));
    }

    item.appendChild(button);
    item.appendChild(status);
    return item;
}

async function handleVolumeChange(video, volumePercent) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, frameIds: [video.frameId] },
            func: setVolumeInPage,
            args: [video.id, volumePercent]
        });
    } catch {
        // Popup may have closed mid-drag - nothing useful to show the user at that point.
    }
}

async function handleToggle(video, button, status) {
    button.disabled = true;
    status.textContent = '';

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, frameIds: [video.frameId] },
            func: togglePiPInPage,
            args: [video.id]
        });

        const result = results[0]?.result;
        if (result?.ok) {
            await scanAndRender();
        } else {
            status.textContent = 'Failed: ' + (result?.error || 'unknown error');
            button.disabled = false;
        }
    } catch (error) {
        status.textContent = 'Failed: ' + error.message;
        button.disabled = false;
    }
}
