<?php
// Isolated executable adapter checks. WordPress/WooCommerce boundaries are stubs.
define( 'ABSPATH', '/' ); define( 'DAY_IN_SECONDS', 86400 );
$hooks = array(); $options = array(); $requests = array(); $jobs = array(); $checks = 0;
function add_action( $hook, $callback, $priority = 10, $args = 1 ) { $GLOBALS['hooks'][ $hook ][] = $callback; }
function wp_parse_args( $value, $defaults ) { return array_merge( $defaults, $value ); }
function get_option( $name, $default = false ) { return isset( $GLOBALS['options'][ $name ] ) ? $GLOBALS['options'][ $name ] : $default; }
function update_option( $name, $value, $autoload = false ) { $GLOBALS['options'][ $name ] = $value; }
function add_option( $name, $value, $deprecated = '', $autoload = false ) { if ( isset( $GLOBALS['options'][ $name ] ) ) { return false; } $GLOBALS['options'][ $name ] = $value; return true; }
function delete_option( $name ) { unset( $GLOBALS['options'][ $name ] ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
function wp_generate_uuid4() { return '10000000-0000-4000-8000-000000000001'; }
class WP_Error { public $code; public $message; function __construct( $code, $message ) { $this->code=$code; $this->message=$message; } function get_error_message() { return $this->message; } }
function is_wp_error( $value ) { return $value instanceof WP_Error; }
function wp_safe_remote_post( $url, $args ) { $GLOBALS['requests'][]=array('url'=>$url,'args'=>$args); return array('status'=>isset($GLOBALS['remote_status'])?$GLOBALS['remote_status']:200,'body'=>json_encode(array('ok'=>true,'data'=>isset($GLOBALS['remote_data'])?$GLOBALS['remote_data']:array('connected'=>true)))); }
function wp_remote_retrieve_response_code( $response ) { return $response['status']; }
function wp_remote_retrieve_body( $response ) { return $response['body']; }
function wc_get_price_decimals() { return isset($GLOBALS['precision'])?$GLOBALS['precision']:2; }
function sanitize_text_field( $value ) { return is_string($value)?strip_tags($value):''; }
function wp_unslash( $value ) { return $value; }
function apply_filters( $name, $default ) { return isset($GLOBALS['consent_override'])?$GLOBALS['consent_override']:$default; }
function is_ssl() { return true; } function is_admin() { return false; }
function wp_parse_url( $url ) { return parse_url($url); } function home_url() { return 'https://store.example'; }
function wp_verify_nonce( $value, $action ) { return 'valid'===$value; } function nocache_headers() {}
function wc_get_order( $id ) { return isset($GLOBALS['test_orders'][$id])?$GLOBALS['test_orders'][$id]:false; }
function as_enqueue_async_action( $hook, $args, $group, $unique ) { $GLOBALS['jobs'][]=array($hook,$args,$group,$unique); }
function as_schedule_single_action( $at, $hook, $args, $group, $unique ) { $GLOBALS['jobs'][]=array($hook,$args,$group,$unique,$at); }
class Line {
    public $total; public $tax; public $type;
    function __construct($total,$tax='0',$type='line_item'){$this->total=$total;$this->tax=$tax;$this->type=$type;}
    function get_total(){return $this->total;} function get_total_tax(){return $this->tax;} function get_type(){return $this->type;}
}
class Refund {
    public $amount; public $items;
    function __construct($amount,$items){$this->amount=$amount;$this->items=$items;}
    function get_amount(){return $this->amount;} function get_items($types){return $this->items;}
}
class WC_Order {
    public $meta=array(); public $items=array(); public $refunds=array(); public $status='processing';
    function get_id(){return 123;} function get_meta($key){return isset($this->meta[$key])?$this->meta[$key]:'';} function update_meta_data($key,$value){$this->meta[$key]=$value;}
    function get_items($type){return $this->items;} function get_refunds(){return $this->refunds;} function get_status(){return $this->status;} function get_currency(){return 'USD';}
    function get_date_created(){return new DateTimeImmutable('2026-10-15T08:00:01Z');} function save(){}
}
require __DIR__ . '/../integrations/woocommerce/affimaro/affimaro.php';
function check($condition,$message){++$GLOBALS['checks'];if(!$condition){throw new RuntimeException('Check failed: '.$message);}}
function throws($callback){try{$callback();return false;}catch(RuntimeException $error){return true;}}

check(affimaro_minor('12.34',2)===1234,'exact cents');
check(affimaro_minor('0.005',2)===1,'half-up rounding');
check(affimaro_minor('5',0)===5,'zero-decimal currency');
check(affimaro_minor('1.2345',3)===1235,'three-decimal currency');
check(affimaro_minor('0.123456',6)===123456,'six-decimal precision');
check(throws(function(){affimaro_minor('1000000000001',0);}), 'reject excessive amounts');
$order=new WC_Order();$order->items=array(new Line('100.00'),new Line('20.00'));$GLOBALS['test_orders'][123]=$order;
date_default_timezone_set('Asia/Kabul');$snapshot=affimaro_snapshot($order);
check($snapshot['createdAt']==='2026-10-15T08:00:01.000Z','UTC order timestamp');
check($snapshot['basis']===12000,'merchandise total');check($snapshot['refundedBasis']===0,'initial refund');
$order->refunds=array(new Refund('35.00',array(new Line('-25.00','-5.00'),new Line('-5.00','0','shipping'))));$snapshot=affimaro_snapshot($order);
check($snapshot['refundedBasis']===2500,'shipping/tax excluded from merchandise refund');check($snapshot['refundUnallocated']===false,'allocated refund');
$order->refunds=array(new Refund('20.00',array()));check(affimaro_snapshot($order)['refundUnallocated']===true,'unallocated refund requires review');
$order->status='refunded';$snapshot=affimaro_snapshot($order);check($snapshot['refundedBasis']===12000,'full refund reverses entire merchandise basis');check($snapshot['refundUnallocated']===false,'full refund does not need partial-allocation review');$order->status='processing';
$order->items=array(new Line('-10.00'));check(throws(function()use($order){affimaro_snapshot($order);}), 'negative product total rejected');$order->items=array(new Line('120.00'));$order->refunds=array();
$order->status='custom';check(throws(function()use($order){affimaro_snapshot($order);}), 'unsupported status rejected');$order->status='processing';

$ref='20000000-0000-4000-8000-000000000002';$_COOKIE=array('affimaro_referral'=>$ref);
affimaro_attach_referral($order);check($order->get_meta('_affimaro_referral')==='','no consent, no attribution');
$_COOKIE['affimaro_consent']='yes';affimaro_attach_referral($order);check($order->get_meta('_affimaro_referral')===$ref,'consented classic checkout attribution');
$_COOKIE['affimaro_referral']='30000000-0000-4000-8000-000000000003';affimaro_attach_referral($order);check($order->get_meta('_affimaro_referral')===$ref,'order attribution immutable');
$block=new WC_Order();foreach($hooks['woocommerce_store_api_checkout_update_order_meta'] as $callback){$callback($block);}check($block->get_meta('_affimaro_referral')===$_COOKIE['affimaro_referral'],'block checkout attribution hook');

$options['affimaro_connection']=array('url'=>'https://affimaro.example','id'=>'40000000-0000-4000-8000-000000000004','key'=>str_repeat('1',64));
define('AFFIMARO_SITES_SERVICE_TOKEN','isolated-test-service-token');define('AFFIMARO_SITES_SERVICE_ORIGIN','https://affimaro.example');
$result=affimaro_send(array('kind'=>'ping','storeUrl'=>'https://store.example'));check(!is_wp_error($result),'signed delivery succeeds');
$last=end($requests);$headers=$last['args']['headers'];$expected=hash_hmac('sha256',$headers['X-Affimaro-Timestamp'].'.'.$headers['X-Affimaro-Event'].'.'.$last['args']['body'],str_repeat('1',64));
check(hash_equals($expected,$headers['X-Affimaro-Signature']),'raw body HMAC');check($headers['OAI-Sites-Authorization']==='Bearer isolated-test-service-token','private service header server only');
check($last['args']['redirection']===0 && $last['args']['sslverify']===true,'no redirects, TLS verified');
$options['affimaro_connection']['url']='https://other.example';$before=count($requests);check(is_wp_error(affimaro_send(array('kind'=>'ping','storeUrl'=>'https://store.example'))),'reject mismatched private origin');check(count($requests)===$before,'never forward private credential to other origin');$options['affimaro_connection']['url']='https://affimaro.example';
affimaro_queue_order(123);check(count($jobs)===1 && $jobs[0][3]===true,'unique scheduled order job');
check($jobs[0][1]===array(123,0),'no credentials in scheduler arguments');
$remote_status=503;foreach($hooks['affimaro_sync_order'] as $callback){$callback(123,0);}check(count($jobs)===2 && $jobs[1][1]===array(123,1),'delivery failure retries fresh order');check(!get_option('affimaro_order_lock_123',false),'order lock released after failure');$remote_status=200;

$_GET=array('affimaro_ref'=>$ref);$_POST=array();$_COOKIE=array();$before=count($requests);
foreach($hooks['template_redirect'] as $callback){$callback();}check(count($requests)===$before,'referral request waits for consent');check(isset($GLOBALS['affimaro_consent_candidate']),'consent offered');
unset($GLOBALS['affimaro_consent_candidate']);$_POST=array('affimaro_choice'=>'allow','affimaro_ref'=>$ref,'_affimaro_nonce'=>'valid');$_SERVER['HTTP_ORIGIN']='https://evil.example';
foreach($hooks['template_redirect'] as $callback){$callback();}check(count($requests)===$before && empty($_COOKIE),'cross-origin consent rejected');
$_SERVER['HTTP_ORIGIN']='https://store.example';$remote_data=array('referralId'=>$ref,'expiresAt'=>gmdate('Y-m-d\TH:i:s.000\Z',time()+86400));
foreach($hooks['template_redirect'] as $callback){$callback();}check(isset($_COOKIE['affimaro_referral']) && $_COOKIE['affimaro_referral']===$ref,'consent enables server-verified referral cookie');
$_POST['affimaro_choice']='decline';$before=count($requests);foreach($hooks['template_redirect'] as $callback){$callback();}check($_COOKIE['affimaro_referral']==='' && count($requests)===$before,'decline clears referral without collection');
echo json_encode(array('checks'=>$checks,'php'=>PHP_VERSION,'ok'=>true));
