#include <cstdio>

long long sum = 0;

void process(int remaining) {
    if (remaining == 0) return;
    int x;
    scanf("%d", &x);
    sum += x;
    process(remaining - 1);
    printf("%d ", x);
}

int main() {
    int n;
    scanf("%d", &n);
    process(n);
    printf("\n%lld\n", sum);
    return 0;
}
