import os
from flask import Flask, render_template, request, jsonify
import database
import monitor

app = Flask(__name__)

# Initialize SQLite Database tables on startup
database.init_db()

@app.route('/')
def index():
    """Renders the primary Observability Dashboard UI."""
    return render_template('index.html')

@app.route('/api/websites', methods=['GET'])
def get_websites():
    """Returns all monitored websites with their latest status details."""
    try:
        websites = database.get_websites()
        summary = database.get_dashboard_summary()
        return jsonify({
            'success': True,
            'websites': websites,
            'summary': summary
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Database error: {str(e)}'}), 500

@app.route('/api/websites', methods=['POST'])
def add_website():
    """Validates URL, saves website, and immediately executes its initial check."""
    data = request.get_json() or {}
    name_input = data.get('name', '').strip()
    url_input = data.get('url', '').strip()

    if not url_input:
        return jsonify({'success': False, 'error': 'Please provide a valid website URL.'}), 400

    # SSRF & Format Validation
    is_valid, normalized_url, fallback_name = monitor.validate_and_normalize_url(url_input)
    if not is_valid:
        return jsonify({'success': False, 'error': normalized_url}), 400

    website_name = name_input if name_input else fallback_name

    try:
        website = database.add_website(website_name, normalized_url)
    except ValueError as val_err:
        return jsonify({'success': False, 'error': str(val_err)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to store website: {str(e)}'}), 500

    # Execute immediate initial HTTP check
    check_result = monitor.perform_http_check(website['url'])
    recorded_check = database.add_check(
        website_id=website['id'],
        status=check_result['status'],
        http_status=check_result['http_status'],
        response_time=check_result['response_time'],
        response_size=check_result['response_size'],
        error_message=check_result['error_message']
    )

    updated_website = database.get_website_by_id(website['id'])

    return jsonify({
        'success': True,
        'website': updated_website,
        'initial_check': recorded_check,
        'message': f"Website '{website_name}' added and initial check completed."
    }), 201

@app.route('/api/websites/<int:website_id>', methods=['DELETE'])
def delete_website(website_id):
    """Deletes a website and its monitoring records."""
    try:
        deleted = database.delete_website(website_id)
        if not deleted:
            return jsonify({'success': False, 'error': 'Website not found.'}), 404
        return jsonify({'success': True, 'message': 'Website deleted successfully.'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Database error: {str(e)}'}), 500

@app.route('/api/websites/<int:website_id>/check', methods=['POST'])
def check_website(website_id):
    """Executes a real manual HTTP check for a specific website."""
    website = database.get_website_by_id(website_id)
    if not website:
        return jsonify({'success': False, 'error': 'Website not found.'}), 404

    check_result = monitor.perform_http_check(website['url'])
    recorded_check = database.add_check(
        website_id=website['id'],
        status=check_result['status'],
        http_status=check_result['http_status'],
        response_time=check_result['response_time'],
        response_size=check_result['response_size'],
        error_message=check_result['error_message']
    )

    updated_website = database.get_website_by_id(website_id)

    return jsonify({
        'success': True,
        'website': updated_website,
        'latest_check': recorded_check
    })

@app.route('/api/websites/<int:website_id>/history', methods=['GET'])
def get_website_history(website_id):
    """Fetches check history records for a given website for charts & tables."""
    website = database.get_website_by_id(website_id)
    if not website:
        return jsonify({'success': False, 'error': 'Website not found.'}), 404

    history = database.get_website_history(website_id, limit=50)
    return jsonify({
        'success': True,
        'website': website,
        'history': history
    })

@app.route('/api/check-all', methods=['POST'])
def check_all():
    """Triggers an HTTP check across all registered websites."""
    try:
        websites = database.get_websites()
        results = []

        for site in websites:
            check_res = monitor.perform_http_check(site['url'])
            rec_check = database.add_check(
                website_id=site['id'],
                status=check_res['status'],
                http_status=check_res['http_status'],
                response_time=check_res['response_time'],
                response_size=check_res['response_size'],
                error_message=check_res['error_message']
            )
            results.append({
                'website_id': site['id'],
                'website_name': site['name'],
                'check': rec_check
            })

        summary = database.get_dashboard_summary()
        updated_websites = database.get_websites()

        return jsonify({
            'success': True,
            'checked_count': len(results),
            'results': results,
            'websites': updated_websites,
            'summary': summary
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Error performing refresh all: {str(e)}'}), 500

@app.route('/api/summary', methods=['GET'])
def get_summary():
    """Returns overview statistics and global recent activity log."""
    try:
        summary = database.get_dashboard_summary()
        recent_checks = database.get_all_recent_checks(limit=30)
        return jsonify({
            'success': True,
            'summary': summary,
            'recent_checks': recent_checks
        })
    except Exception as e:
        return jsonify({'success': False, 'error': f'Database error: {str(e)}'}), 500

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'API Endpoint not found.'}), 404
    return render_template('index.html'), 404

@app.errorhandler(500)
def server_error(e):
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'Internal Server Error.'}), 500
    return render_template('index.html'), 500

if __name__ == '__main__':
    print("Starting PulseWatch Website Performance Monitor on http://127.0.0.1:5050")
    app.run(debug=True, host='0.0.0.0', port=5050)
