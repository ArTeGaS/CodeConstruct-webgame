"""Результат: програма має вивести суму всіх парних чисел від 1 до n."""

n = int(input("Введи n: "))

total = 0
for i in range(1, n + 1)
    if i % 2 == 0:
        total += i

print("Сума парних:", total)
