"""Результат: програма має вивести суму чисел від 1 до n."""

n = int(input("Введи n: "))

total = 0
for i in range(1, n + 1):
    total += i

return total
