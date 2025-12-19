(function($) {
    'use strict';
    
    $(document).ready(function() {
        // Create modal overlay if it doesn't exist
        if ($('#grade-modal').length === 0) {
            $('body').append(`
                <div id="grade-modal" class="modal-overlay">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2 id="modal-title">Edit Grade History</h2>
                            <button class="modal-close" aria-label="Close">&times;</button>
                        </div>
                        <div class="modal-body">
                            <iframe id="modal-iframe" src=""></iframe>
                        </div>
                    </div>
                </div>
            `);
        }

        var $modal = $('#grade-modal');
        var $iframe = $('#modal-iframe');
        var $modalTitle = $('#modal-title');

        // Handle edit button clicks
        $(document).on('click', '.inline-edit-btn', function(e) {
            e.preventDefault();
            var url = $(this).data('url');
            $modalTitle.text('Edit Grade History');
            $iframe.attr('src', url + '?_popup=1');
            $modal.addClass('active');
        });

        // Handle delete button clicks
        $(document).on('click', '.inline-delete-btn', function(e) {
            e.preventDefault();
            var url = $(this).data('url');
            $modalTitle.text('Delete Grade History');
            $iframe.attr('src', url + '?_popup=1');
            $modal.addClass('active');
        });

        // Handle add button clicks
        $(document).on('click', '.add-grade-btn', function(e) {
            e.preventDefault();
            var url = $(this).attr('href');
            $modalTitle.text('Add Grade History');
            $iframe.attr('src', url + '&_popup=1');
            $modal.addClass('active');
        });

        // Close modal on close button click
        $(document).on('click', '.modal-close', function() {
            $modal.removeClass('active');
            $iframe.attr('src', '');
        });

        // Close modal on overlay click
        $modal.on('click', function(e) {
            if (e.target === this) {
                $modal.removeClass('active');
                $iframe.attr('src', '');
            }
        });

        // Listen for messages from iframe (when save is successful)
        window.addEventListener('message', function(e) {
            if (e.data === 'reload-parent') {
                $modal.removeClass('active');
                $iframe.attr('src', '');
                // Reload the current page to show updated data
                window.location.reload();
            }
        });

        // Intercept form submissions in iframe to close modal
        $iframe.on('load', function() {
            try {
                var $iframeDoc = $iframe.contents();
                
                // Check if we're on a success page (after save)
                if ($iframeDoc.find('.success, .messagelist .success').length > 0) {
                    // Small delay to let user see success message
                    setTimeout(function() {
                        window.postMessage('reload-parent', '*');
                    }, 500);
                }

                // Handle popup close links
                $iframeDoc.find('a').on('click', function(e) {
                    var href = $(this).attr('href');
                    if (href && href.indexOf('window.close') !== -1) {
                        e.preventDefault();
                        window.postMessage('reload-parent', '*');
                    }
                });
            } catch (e) {
                // Cross-origin iframe, ignore
            }
        });
    });
})(django.jQuery);
