import Plugin from '@ckeditor/ckeditor5-core/src/plugin';

/**
 * The stock Mention feature has no opinion on how a mention should be
 * rendered to/from HTML - it just stores a `mention` model attribute and
 * leaves conversion to the integrator. This plugin converts it to/from a
 * plain `<a href="...">` element, so a mention saved from an article is a
 * normal link on the public site (no extra CSS/JS needed there) and still
 * round-trips correctly when the article is reopened for editing.
 */
export default class MentionLinks extends Plugin {
    static get pluginName() {
        return 'MentionLinks';
    }

    init() {
        const editor = this.editor;

        editor.conversion.for('downcast').attributeToElement({
            model: 'mention',
            view: (modelAttributeValue, { writer }) => {
                if (!modelAttributeValue) {
                    return;
                }
                return writer.createAttributeElement('a', {
                    class: 'ck-mention-link',
                    'data-mention': modelAttributeValue.id,
                    'data-mention-type': modelAttributeValue.mentionType,
                    href: modelAttributeValue.link,
                }, {
                    priority: 20,
                    id: modelAttributeValue.uid,
                });
            },
            converterPriority: 'high',
        });

        editor.conversion.for('upcast').elementToAttribute({
            view: {
                name: 'a',
                attributes: {
                    'data-mention': true,
                },
            },
            model: {
                key: 'mention',
                value: (viewElement) => {
                    const mentionText = viewElement.getChild(0)?.data || '';
                    const mentionId = viewElement.getAttribute('data-mention');
                    const mentionType = viewElement.getAttribute('data-mention-type');
                    const link = viewElement.getAttribute('href');

                    return editor.plugins.get('Mention').toMentionAttribute(viewElement, {
                        id: mentionId,
                        mentionType,
                        link,
                        _text: mentionText,
                    });
                },
            },
            converterPriority: 'high',
        });
    }
}
