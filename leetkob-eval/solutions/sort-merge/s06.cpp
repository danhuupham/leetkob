#include <cstdio>

void merge(int a[], int n) {
    for (int i = 0; i + 1 < n; i++)
        if (a[i] > a[i + 1]) {
            int t = a[i]; a[i] = a[i + 1]; a[i + 1] = t;
        }
}

void merge_sort(int a[], int n) {
    for (int lan = 0; lan < n; lan++)
        merge(a, n);
}

int arr[5005];

int main() {
    int n;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);
    merge_sort(arr, n);
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\n");
    return 0;
}
