"""Результат: програма має вивести суму чисел від 1 до n."""

def sum_to(n):
    return n + sum_to(n - 1)

n = int(input("Введи n: "))
print("Сума:", sum_to(n))
