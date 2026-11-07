with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
),

refunds as (
    select order_id, sum(amount) as refunded
    from payments
    where amount < 0
    group by order_id
),

order_payments as (
    select order_id, sum(amount) as total_amount
    from payments
    group by order_id
),

final as (
    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        order_payments.total_amount as amount,
        refunds.refunded
    from orders
    left join order_payments using (order_id)
    left join refunds using (order_id)
)

select * from final
