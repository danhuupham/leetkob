#include <iostream>
#include <queue>
#include <vector>
#include <functional>
using namespace std;

vector<int> mergeSort(const vector<int>& a) {
    priority_queue<int, vector<int>, greater<int>> pq(a.begin(), a.end());
    vector<int> res;
    while (!pq.empty()) {
        res.push_back(pq.top());
        pq.pop();
    }
    return res;
}

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i = 0; i < n; i++) cin >> a[i];
    vector<int> b = mergeSort(a);
    for (int x : b) cout << x << " ";
    cout << "\n";
    return 0;
}
