with customers as (
    select * from {{ ref('customers') }}
),

paid_orders as (
    select * from {{ ref('orders') }}
    where status = 'completed'
),

revenue as (
    select
        customer_id,
        count(*) as orders,
        sum(amount) as revenue
    from paid_orders
    group by customer_id
)

select
    customers.customer_id,
    customers.name,
    customers.country,
    coalesce(revenue.orders, 0) as orders,
    coalesce(revenue.revenue, 0) as revenue
from customers
left join revenue using (customer_id)
