with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
    where status = 'success'
),

customers as (
    select customer_id, first_name
    from {{ ref('stg_customers') }}
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
        customers.first_name,
        orders.order_date,
        order_payments.total_amount as amount
    from orders
    left join customers using (customer_id)
    left join order_payments using (order_id)
)

select * from final
