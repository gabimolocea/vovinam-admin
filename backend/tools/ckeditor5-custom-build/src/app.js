import ClassicEditor from './ckeditor';
import './override-django.css';

let editors = [];

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// @mention autocomplete for athletes and clubs, available in every
// CKEditor5 field site-wide (news articles, event descriptions, etc).
// Backed by a lightweight public search endpoint (see api/views/core.py
// mention_search) - same visibility as the existing public athlete/club
// list endpoints, nothing new is exposed.
const MENTION_TYPE_LABEL = {
    athlete: 'Sportiv',
    club: 'Club',
};

function mentionFeed(queryText) {
    const url = `/api/mentions/?query=${encodeURIComponent(queryText)}`;
    return fetch(url, { headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : []))
        .then((items) => items.map((item) => ({
            id: `@${item.name}`,
            name: item.name,
            link: item.url,
            mentionType: item.type,
        })))
        .catch(() => []);
}

function mentionItemRenderer(item) {
    const span = document.createElement('span');
    span.classList.add('ck-mention-suggestion');
    const label = document.createElement('span');
    label.classList.add('ck-mention-suggestion__name');
    label.textContent = item.name;
    const badge = document.createElement('span');
    badge.classList.add('ck-mention-suggestion__badge');
    badge.textContent = MENTION_TYPE_LABEL[item.mentionType] || '';
    span.appendChild(label);
    span.appendChild(badge);
    return span;
}

document.addEventListener("DOMContentLoaded", () => {
    const allEditors = document.querySelectorAll('.django_ckeditor_5');
    for (let i = 0; i < allEditors.length; ++i) {
        const script_id = `${allEditors[i].id}_script`
        const upload_url = document.getElementById(
            `ck-editor-5-upload-url-${script_id}`
        ).getAttribute('data-upload-url');
        document.querySelector(`[for$="${allEditors[i].id}"]`).style.float = 'none';
        const config = JSON.parse(document.getElementById(script_id).textContent);

        config['simpleUpload'] = {
            'uploadUrl': upload_url, 'headers': {
                'X-CSRFToken': getCookie('csrftoken'),
            }
        }
        config['mention'] = {
            feeds: [
                {
                    marker: '@',
                    feed: mentionFeed,
                    itemRenderer: mentionItemRenderer,
                    minimumCharacters: 2,
                },
            ],
        };
        ClassicEditor.create(allEditors[i],
            config).then(editor => {
            editors.push(editor);
        }).catch(error => {

        });
    }
    window.editors = editors;
    window.ClassicEditor = ClassicEditor;
});
