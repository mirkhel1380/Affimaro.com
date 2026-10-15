<?php
/**
 * Plugin Name: Affimaro for WooCommerce
 * Description: First-party referral attribution and signed order/refund delivery to your Affimaro workspace.
 * Version: 0.3.0
 * Author: Highlink
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * License: GPL-2.0-or-later
 */
defined( 'ABSPATH' ) || exit;

add_action( 'before_woocommerce_init', function () {
    if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );

function affimaro_settings() {
    return wp_parse_args( get_option( 'affimaro_connection', array() ), array( 'url' => 'https://affimaro-preview.kindsky66.chatgpt.site', 'id' => '', 'key' => '' ) );
}
function affimaro_uuid( $value ) {
    return is_string( $value ) && 1 === preg_match( '/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $value );
}
function affimaro_send( $payload ) {
    $settings = affimaro_settings();
    if ( ! affimaro_uuid( $settings['id'] ) || ! preg_match( '/^[a-f0-9]{64}$/', $settings['key'] ) ) {
        return new WP_Error( 'configuration', 'Complete the Affimaro connection settings first.' );
    }
    $body = wp_json_encode( $payload );
    $timestamp = (string) time();
    $event = wp_generate_uuid4();
    $headers = array(
        'Content-Type' => 'application/json',
        'X-Affimaro-Store' => $settings['id'],
        'X-Affimaro-Event' => $event,
        'X-Affimaro-Timestamp' => $timestamp,
        'X-Affimaro-Signature' => hash_hmac( 'sha256', $timestamp . '.' . $event . '.' . $body, $settings['key'] ),
    );
    // An optional PRIVATE server credential. Never put it in the ZIP, settings page or browser.
    // The exact origin binding prevents forwarding it to another endpoint after a settings edit.
    if ( defined( 'AFFIMARO_SITES_SERVICE_TOKEN' ) && defined( 'AFFIMARO_SITES_SERVICE_ORIGIN' ) ) {
        if ( rtrim( AFFIMARO_SITES_SERVICE_ORIGIN, '/' ) !== $settings['url'] ) {
            return new WP_Error( 'service_origin', 'The private service origin does not match the Affimaro URL.' );
        }
        $headers['OAI-Sites-Authorization'] = 'Bearer ' . AFFIMARO_SITES_SERVICE_TOKEN;
    }
    $response = wp_safe_remote_post( $settings['url'] . '/api/woocommerce/event', array(
        'headers' => $headers, 'body' => $body, 'timeout' => 15, 'redirection' => 0,
        'sslverify' => true, 'limit_response_size' => 16384,
    ) );
    if ( is_wp_error( $response ) ) {
        return new WP_Error( 'transport', 'The Affimaro request could not be delivered.' );
    }
    $status = wp_remote_retrieve_response_code( $response );
    $decoded = json_decode( wp_remote_retrieve_body( $response ), true );
    if ( $status < 200 || $status >= 300 || ! is_array( $decoded ) || empty( $decoded['ok'] ) || ! isset( $decoded['data'] ) ) {
        return new WP_Error( 'http_' . (int) $status, 'Affimaro did not accept the request (HTTP ' . (int) $status . '). Check the connection and private service access.' );
    }
    return $decoded['data'];
}

add_action( 'admin_menu', function () {
    add_submenu_page( 'woocommerce', 'Affimaro', 'Affimaro', 'manage_woocommerce', 'affimaro', 'affimaro_admin' );
} );
function affimaro_admin() {
    if ( ! current_user_can( 'manage_woocommerce' ) ) { return; }
    $settings = affimaro_settings();
    $last = get_option( 'affimaro_last_delivery', array() );
    ?>
    <div class="wrap"><h1>Affimaro</h1><p>Connect this store to its Affimaro business workspace. Order delivery contains merchandise amounts and a referral ID; customer names, email addresses and payment details are excluded.</p>
    <?php if ( isset( $_GET['saved'] ) ) : ?><div class="notice notice-info"><p>Settings saved. Use Test connection before sharing referral links.</p></div><?php endif; ?>
    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
    <input type="hidden" name="action" value="affimaro_save"><?php wp_nonce_field( 'affimaro_save' ); ?>
    <table class="form-table"><tr><th><label for="affimaro-url">Affimaro URL</label></th><td><input class="regular-text" id="affimaro-url" name="url" type="url" required value="<?php echo esc_attr( $settings['url'] ); ?>"><p class="description">The HTTPS origin of your Affimaro installation, without a trailing path.</p></td></tr>
    <tr><th><label for="affimaro-id">Connection ID</label></th><td><input class="regular-text" id="affimaro-id" name="id" required value="<?php echo esc_attr( $settings['id'] ); ?>"></td></tr>
    <tr><th><label for="affimaro-key">Signing key</label></th><td><input class="regular-text" id="affimaro-key" name="key" type="password" autocomplete="new-password" value=""><p class="description">Paste a new key, or leave blank to keep the saved key. Saved keys are never displayed.</p></td></tr></table>
    <?php submit_button( 'Save connection' ); ?></form>
    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="affimaro_test"><?php wp_nonce_field( 'affimaro_test' ); ?><?php submit_button( 'Test connection', 'secondary' ); ?></form>
    <p><strong>Last delivery:</strong> <?php echo esc_html( isset( $last['message'] ) ? $last['message'] : 'No delivery attempted.' ); ?> <?php echo esc_html( isset( $last['at'] ) ? $last['at'] : '' ); ?></p>
    <h2>Retry an attributed order</h2><p>Retries read the current WooCommerce order, including its latest refunds. Only orders with an Affimaro referral are sent.</p>
    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>"><input type="hidden" name="action" value="affimaro_retry"><?php wp_nonce_field( 'affimaro_retry' ); ?><label>WooCommerce order ID <input type="number" name="order_id" min="1" required></label><?php submit_button( 'Queue retry', 'secondary' ); ?></form>
    <h2>Private pilot</h2><p>A private Affimaro Site also requires supported Sites service access configured only on this server. The signing key alone cannot pass the private Site access gate. See the bundled README. Changing this form does not change the Site audience.</p>
    <h2>Referral cookies</h2><p>Visitors arriving with an Affimaro referral are offered Allow / No thanks. A referral cookie is written after Allow. A consent manager can instead control the <code>affimaro_tracking_allowed</code> filter. Do not serve referral query URLs from a full-page cache.</p></div>
    <?php
}
function affimaro_admin_check( $action ) {
    if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( 'Access denied.', '', array( 'response' => 403 ) ); }
    check_admin_referer( $action );
}
function affimaro_admin_return() {
    wp_safe_redirect( admin_url( 'admin.php?page=affimaro&saved=1' ) ); exit;
}
add_action( 'admin_post_affimaro_save', function () {
    affimaro_admin_check( 'affimaro_save' );
    $old = affimaro_settings();
    $url = rtrim( esc_url_raw( wp_unslash( isset( $_POST['url'] ) ? $_POST['url'] : '' ) ), '/' );
    $parts = wp_parse_url( $url );
    $id = sanitize_text_field( wp_unslash( isset( $_POST['id'] ) ? $_POST['id'] : '' ) );
    $key = trim( wp_unslash( isset( $_POST['key'] ) ? $_POST['key'] : '' ) );
    if ( '' === $key && $id === $old['id'] && $url === $old['url'] ) { $key = $old['key']; }
    if ( ! is_array( $parts ) || 'https' !== ( isset( $parts['scheme'] ) ? $parts['scheme'] : '' ) || ! empty( $parts['user'] ) || ! empty( $parts['pass'] ) || ! empty( $parts['query'] ) || ! empty( $parts['fragment'] ) || ! empty( $parts['path'] ) || ! affimaro_uuid( $id ) || ! preg_match( '/^[a-f0-9]{64}$/', $key ) ) {
        wp_die( 'Use a complete HTTPS origin, connection UUID and 64-character signing key.' );
    }
    update_option( 'affimaro_connection', array( 'url' => $url, 'id' => $id, 'key' => $key ), false );
    affimaro_admin_return();
} );
function affimaro_delivery_status( $result ) {
    update_option( 'affimaro_last_delivery', array( 'at' => gmdate( 'Y-m-d H:i:s' ) . ' UTC', 'message' => is_wp_error( $result ) ? $result->get_error_message() : 'Accepted by Affimaro.' ), false );
}
add_action( 'admin_post_affimaro_test', function () {
    affimaro_admin_check( 'affimaro_test' );
    affimaro_delivery_status( affimaro_send( array( 'kind' => 'ping', 'storeUrl' => rtrim( home_url(), '/' ) ) ) );
    affimaro_admin_return();
} );
add_action( 'admin_post_affimaro_retry', function () {
    affimaro_admin_check( 'affimaro_retry' );
    affimaro_queue_order( absint( isset( $_POST['order_id'] ) ? $_POST['order_id'] : 0 ) );
    affimaro_admin_return();
} );

// The consent/referral cookies stay on the store. No browser request goes to Affimaro.
function affimaro_cookie( $name, $value, $expires ) {
    setcookie( $name, $value, array( 'expires' => $expires, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax' ) );
    $_COOKIE[ $name ] = $value;
}
add_action( 'init', function () {
    if ( isset( $_GET['affimaro_ref'] ) || isset( $_POST['affimaro_choice'] ) ) {
        if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
    }
} );
add_action( 'template_redirect', function () {
    if ( is_admin() || ! is_ssl() || ! function_exists( 'wc_get_order' ) ) { return; }
    $settings = affimaro_settings();
    if ( ! $settings['key'] || ! $settings['id'] ) { return; }
    $candidate = isset( $_GET['affimaro_ref'] ) ? sanitize_text_field( wp_unslash( $_GET['affimaro_ref'] ) ) : '';
    $allowed = isset( $_COOKIE['affimaro_consent'] ) && 'yes' === $_COOKIE['affimaro_consent'];
    if ( isset( $_POST['affimaro_choice'] ) ) {
        $origin = isset( $_SERVER['HTTP_ORIGIN'] ) ? wp_parse_url( wp_unslash( $_SERVER['HTTP_ORIGIN'] ) ) : array();
        $home = wp_parse_url( home_url() );
        $same_origin = isset( $origin['host'], $origin['scheme'] ) && $origin['host'] === $home['host'] && $origin['scheme'] === $home['scheme'] && ( isset( $origin['port'] ) ? $origin['port'] : 443 ) === ( isset( $home['port'] ) ? $home['port'] : 443 );
        if ( ! $same_origin || ! isset( $_POST['_affimaro_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['_affimaro_nonce'] ) ), 'affimaro_referral' ) ) { return; }
        $candidate = sanitize_text_field( wp_unslash( isset( $_POST['affimaro_ref'] ) ? $_POST['affimaro_ref'] : '' ) );
        $allowed = 'allow' === $_POST['affimaro_choice'];
        affimaro_cookie( 'affimaro_consent', $allowed ? 'yes' : 'no', time() + 90 * DAY_IN_SECONDS );
        if ( ! $allowed ) { affimaro_cookie( 'affimaro_referral', '', time() - 3600 ); return; }
    }
    if ( ! affimaro_uuid( $candidate ) ) { return; }
    nocache_headers();
    $allowed = (bool) apply_filters( 'affimaro_tracking_allowed', $allowed );
    if ( ! $allowed ) {
        if ( ! isset( $_COOKIE['affimaro_consent'] ) ) { $GLOBALS['affimaro_consent_candidate'] = $candidate; }
        return;
    }
    // A second accepted link replaces the previous referral (last accepted touch).
    $result = affimaro_send( array( 'kind' => 'referral', 'applicationId' => $candidate ) );
    if ( ! is_wp_error( $result ) && isset( $result['referralId'], $result['expiresAt'] ) && affimaro_uuid( $result['referralId'] ) ) {
        $expires = strtotime( $result['expiresAt'] );
        if ( $expires > time() && $expires <= time() + 91 * DAY_IN_SECONDS ) { affimaro_cookie( 'affimaro_referral', $result['referralId'], $expires ); }
    }
} );
add_action( 'wp_footer', function () {
    if ( empty( $GLOBALS['affimaro_consent_candidate'] ) ) { return; }
    ?>
    <aside aria-label="Referral tracking choice" style="position:fixed;bottom:18px;left:18px;right:18px;max-width:660px;margin:auto;padding:22px;background:#fff;color:#18392b;border:1px solid #d7dfd9;border-radius:16px;box-shadow:0 12px 50px #0002;z-index:99999">
    <strong>Credit the partner who sent you here?</strong><p style="margin:8px 0">Allow a referral cookie so this store can credit their commission if you buy. The cookie lasts for the program’s window, up to 90 days.</p>
    <form method="post"><?php wp_nonce_field( 'affimaro_referral', '_affimaro_nonce' ); ?><input type="hidden" name="affimaro_ref" value="<?php echo esc_attr( $GLOBALS['affimaro_consent_candidate'] ); ?>"><button name="affimaro_choice" value="allow" type="submit">Allow referral cookie</button> <button name="affimaro_choice" value="decline" type="submit">No thanks</button></form></aside>
    <?php
} );

function affimaro_attach_referral( $order ) {
    if ( ! $order instanceof WC_Order || $order->get_meta( '_affimaro_referral' ) ) { return; }
    $candidate = isset( $_COOKIE['affimaro_referral'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['affimaro_referral'] ) ) : '';
    $allowed = isset( $_COOKIE['affimaro_consent'] ) && 'yes' === $_COOKIE['affimaro_consent'];
    if ( apply_filters( 'affimaro_tracking_allowed', $allowed ) && affimaro_uuid( $candidate ) ) { $order->update_meta_data( '_affimaro_referral', $candidate ); }
}
add_action( 'woocommerce_checkout_create_order', 'affimaro_attach_referral', 10, 1 );
add_action( 'woocommerce_store_api_checkout_update_order_meta', 'affimaro_attach_referral', 10, 1 );
add_action( 'woocommerce_store_api_checkout_order_processed', function ( $order ) {
    affimaro_attach_referral( $order ); $order->save(); affimaro_queue_order( $order->get_id() );
}, 10, 1 );
add_action( 'woocommerce_checkout_order_processed', function ( $order_id ) { affimaro_queue_order( $order_id ); }, 20, 1 );
add_action( 'woocommerce_order_status_changed', 'affimaro_queue_order', 20, 1 );
add_action( 'woocommerce_payment_complete', 'affimaro_queue_order', 20, 1 );
add_action( 'woocommerce_update_order', 'affimaro_queue_order', 20, 1 );
add_action( 'woocommerce_order_refunded', 'affimaro_queue_order', 20, 1 );
add_action( 'woocommerce_refund_deleted', function ( $refund_id, $order_id ) { affimaro_queue_order( $order_id ); }, 20, 2 );

function affimaro_queue_order( $order_id ) {
    if ( ! function_exists( 'wc_get_order' ) || ! function_exists( 'as_enqueue_async_action' ) ) { return; }
    $order = wc_get_order( $order_id );
    if ( ! $order instanceof WC_Order || ! affimaro_uuid( $order->get_meta( '_affimaro_referral' ) ) ) { return; }
    as_enqueue_async_action( 'affimaro_sync_order', array( (int) $order_id, 0 ), 'affimaro', true );
}
// WooCommerce money is a decimal string. Convert without float multiplication/rounding.
function affimaro_minor( $value, $decimals ) {
    $value = ltrim( (string) $value, '-' );
    if ( ! preg_match( '/^[0-9]+(?:\.[0-9]+)?$/', $value ) || $decimals < 0 || $decimals > 6 ) { throw new RuntimeException( 'Unsupported merchandise amount.' ); }
    $parts = explode( '.', $value, 2 );
    $fraction = isset( $parts[1] ) ? $parts[1] : '';
    $digits = $parts[0] . substr( str_pad( $fraction, $decimals, '0' ), 0, $decimals );
    $result = (int) $digits;
    if ( strlen( $fraction ) > $decimals && (int) $fraction[ $decimals ] >= 5 ) { ++$result; }
    if ( $result > 1000000000000 || $result < 0 ) { throw new RuntimeException( 'Merchandise amount is outside the supported range.' ); }
    return $result;
}
function affimaro_snapshot( $order ) {
    if ( PHP_INT_SIZE < 8 ) { throw new RuntimeException( 'Affimaro requires 64-bit PHP.' ); }
    $precision = wc_get_price_decimals();
    $basis = 0; $refunded = 0; $unallocated = false;
    foreach ( $order->get_items( 'line_item' ) as $item ) {
        if ( 0 === strpos( (string) $item->get_total(), '-' ) ) { throw new RuntimeException( 'Negative merchandise lines require an adapter.' ); }
        $basis += affimaro_minor( $item->get_total(), $precision );
    }
    foreach ( $order->get_refunds() as $refund ) {
        $allocated = 0;
        foreach ( $refund->get_items( array( 'line_item', 'shipping', 'fee' ) ) as $item ) {
            $net = affimaro_minor( $item->get_total(), $precision );
            $allocated += $net + affimaro_minor( $item->get_total_tax(), $precision );
            if ( 'line_item' === $item->get_type() ) { $refunded += $net; }
        }
        if ( affimaro_minor( $refund->get_amount(), $precision ) > $allocated ) { $unallocated = true; }
    }
    if ( $basis > 1000000000000 ) { throw new RuntimeException( 'Order is outside the supported amount range.' ); }
    $status = $order->get_status();
    if ( ! in_array( $status, array( 'pending', 'on-hold', 'processing', 'completed', 'cancelled', 'failed', 'refunded' ), true ) ) { throw new RuntimeException( 'Custom order status needs a supported status mapping.' ); }
    return array(
        'kind' => 'order', 'orderId' => (string) $order->get_id(), 'revision' => (int) floor( microtime( true ) * 1000000 ),
        'referralId' => $order->get_meta( '_affimaro_referral' ),
        'createdAt' => gmdate( 'Y-m-d\TH:i:s.000\Z', $order->get_date_created()->getTimestamp() ),
        'currency' => $order->get_currency(), 'decimals' => $precision, 'basis' => $basis,
        'refundedBasis' => 'refunded' === $status ? $basis : min( $basis, $refunded ), 'status' => $status, 'refundUnallocated' => 'refunded' !== $status && $unallocated,
    );
}
add_action( 'affimaro_sync_order', function ( $order_id, $attempt = 0 ) {
    $lock = 'affimaro_order_lock_' . (int) $order_id;
    $locked_at = (int) get_option( $lock, 0 );
    if ( $locked_at && $locked_at < time() - 120 ) { delete_option( $lock ); }
    if ( ! add_option( $lock, time(), '', false ) ) {
        if ( function_exists( 'as_schedule_single_action' ) ) { as_schedule_single_action( time() + 130, 'affimaro_sync_order', array( (int) $order_id, (int) $attempt ), 'affimaro', true ); }
        return;
    }
    try {
        $order = wc_get_order( $order_id );
        if ( ! $order instanceof WC_Order || ! affimaro_uuid( $order->get_meta( '_affimaro_referral' ) ) ) { return; }
        try { $result = affimaro_send( affimaro_snapshot( $order ) ); }
        catch ( Throwable $error ) { $result = new WP_Error( 'snapshot', 'Order requires review: ' . $error->getMessage() ); }
        affimaro_delivery_status( $result );
        if ( is_wp_error( $result ) && $attempt < 8 && function_exists( 'as_schedule_single_action' ) ) {
            as_schedule_single_action( time() + min( 3600, 60 * ( 2 ** $attempt ) ), 'affimaro_sync_order', array( (int) $order_id, (int) $attempt + 1 ), 'affimaro', true );
        }
    } finally { delete_option( $lock ); }
}, 10, 2 );
